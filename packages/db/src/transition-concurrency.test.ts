/**
 * Two independent PostgreSQL sessions compete over state, payout allocation,
 * return scopes, and cumulative recorded refund ceilings.
 * Explicit disposable localhost URL only; never falls back to DATABASE_URL.
 * PGlite cannot establish this lock behaviour because it serializes writers.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, InvalidTransition, SubOrderLifecycle, SettlementService } from '@diyar/domain';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

const url = process.env.DIYAR_CONCURRENCY_TEST_URL;
const clock = new FixedClock(new Date('2026-10-18T00:00:00Z'));
const platform = { role: 'platform' as const, id: '99999999-9999-4999-8999-999999999999' };

describe.skipIf(!url)('independent PostgreSQL transition transactions', () => {
  let admin: ReturnType<typeof postgres>;
  let first: ReturnType<typeof postgres>;
  let second: ReturnType<typeof postgres>;
  let uowA: DrizzleUnitOfWork;
  let uowB: DrizzleUnitOfWork;
  let seller: string;
  let order: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || !/^\/diyar_concurrency_[a-z0-9_]+$/.test(target.pathname)) {
      throw new Error('Only an explicitly named disposable localhost database is accepted');
    }
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    first = postgres(url!, { max: 1, connection: { application_name: 'diyar_transition_first' } });
    second = postgres(url!, { max: 1, connection: { application_name: 'diyar_transition_second' } });
    // This must be a NEW empty database; refuse to migrate existing data.
    const tables = await admin`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`;
    if (tables[0]!.n !== 0) throw new Error('Concurrency fixture requires an empty disposable database');
    await applyMigrations({
      exec: (sql: string) => admin.unsafe(sql),
      query: async <T>(sql: string) => ({ rows: await admin.unsafe(sql) as unknown as T[] }),
    });
    await admin.unsafe("SET app.actor_role='platform'");
    [ { id: seller } ] = await admin`INSERT INTO sellers(trading_name,owner_name,slug,status)
      VALUES ('Test','Test','concurrency','live') RETURNING id` as [{ id: string }];
    const [customer] = await admin`INSERT INTO customers(phone) VALUES ('01012345678') RETURNING id`;
    [ { id: order } ] = await admin`INSERT INTO orders
      (reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,
       merchandise_piastres,shipping_piastres,total_piastres,payment_method)
      VALUES ('DY-CONCURRENT',${customer!.id},'01012345678','Test','cairo','City','Area','Street','1',
        'unknown',10000,5000,15000,'cod') RETURNING id` as [{ id: string }];
    uowA = new DrizzleUnitOfWork(drizzle(first, { schema }) as unknown as DiyarDatabase, platform);
    uowB = new DrizzleUnitOfWork(drizzle(second, { schema }) as unknown as DiyarDatabase, platform);
  });
  afterAll(async () => {
    await Promise.all([first?.end(), second?.end(), admin?.end()]);
  });

  it('one confirm wins; the blocked loser adds no duplicate history', async () => {
    const [sub] = await admin`INSERT INTO sub_orders
      (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,
       recipient_name,recipient_phone,governorate,city,area,street,building)
      VALUES (${order},${seller},'DY-CONCURRENT-A',10000,5000,'seller','Test','01012345678',
        'cairo','City','Area','Street','1') RETURNING id`;
    const id = sub!.id as string;
    const notify = SubOrderLifecycle.transition('placed', { to: 'awaiting_seller', actor: 'system' }, clock);
    await uowA.transaction((r) => r.subOrders.applyTransition(id, notify.to, notify.actor, null, notify));
    const confirm = SubOrderLifecycle.transition('awaiting_seller', { to: 'confirmed', actor: 'seller' }, clock);
    let signalReady!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const winner = uowA.transaction(async (r) => {
      await r.subOrders.applyTransition(id, confirm.to, confirm.actor, null, confirm);
      signalReady();
      await hold;
    });
    let loser: Promise<unknown> | undefined;
    try {
      await ready;
      // Attach a rejection handler immediately; it must wait on the winner's lock.
      loser = uowB.transaction((r) => r.subOrders.applyTransition(id, confirm.to, confirm.actor, null, confirm))
        .then(() => null, (error: unknown) => error);
      let blocked = false;
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        const waits = await admin`SELECT wait_event_type FROM pg_stat_activity
          WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`;
        blocked = waits.length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
    } finally {
      release();
      await winner;
    }
    expect(await loser).toBeInstanceOf(InvalidTransition);
    const history = await admin`SELECT from_state,to_state FROM sub_order_transitions
      WHERE sub_order_id=${id} AND to_state='confirmed'`;
    expect(history).toEqual([{ from_state: 'awaiting_seller', to_state: 'confirmed' }]);
    const [current] = await admin`SELECT state FROM sub_orders WHERE id=${id}`;
    expect(current!.state).toBe('confirmed');
  });

  it('concurrent payout runs allocate one sub-order only once', async () => {
    const [brand] = await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${seller},'Payout','payout-brand') RETURNING id`;
    const [product] = await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock)
      VALUES(${seller},${brand!.id},'Payout','payout-product','PAYOUT',10000,50,10) RETURNING id`;
    const [sub] = await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,
      delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
      VALUES(${order},${seller},'DY-PAYOUT',10000,0,'seller','Test','01012345678','cairo','City','Area','Street','1') RETURNING id`;
    await admin`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,
      quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres)
      VALUES(${sub!.id},${product!.id},'Payout','Payout','PAYOUT',50,1,10000,10000,'unknown',500,1,500)`;
    for (const state of ['awaiting_seller','confirmed','dispatched','delivered']) {
      await admin`UPDATE sub_orders SET state=${state}::sub_order_state WHERE id=${sub!.id}`;
    }
    await admin`UPDATE sub_orders SET delivered_at=now() WHERE id=${sub!.id}`;
    await admin`INSERT INTO shipments(sub_order_id,cod_collected_piastres,cod_remitted_at)
      VALUES(${sub!.id},10000,now())`;
    const service = new SettlementService(new FixedClock(new Date('2030-01-01T00:00:00Z')));
    let ready!: () => void; let release!: () => void;
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const winner = uowA.transaction(async (r) => {
      const rows = await r.subOrders.listForSettlement(seller);
      const statement = service.build({ sellerId:seller, periodStart:new Date('2020-01-01'), periodEnd:new Date('2030-01-01'),
        subOrders:rows, adjustments:[], reserveDays:0, disputeWindowDays:7 });
      await r.payouts.save({ sellerId:seller, reference:'PO-CONCURRENT', statement });
      ready(); await hold;
    });
    let loser: Promise<unknown> | undefined;
    try {
      await locked;
      loser = uowB.transaction((r) => r.subOrders.listForSettlement(seller));
      let waiting = false;
      for (let attempt=0; attempt<100 && !waiting; attempt++) {
        waiting=(await admin`SELECT 1 FROM pg_stat_activity WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length>0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
    } finally { release(); await winner; }
    const remaining = await loser as { id:string }[];
    expect(remaining.some((row) => row.id===sub!.id)).toBe(false);
    expect(await admin`SELECT count(*)::int n FROM payout_lines WHERE sub_order_id=${sub!.id}`).toEqual([{n:1}]);
  }, 60_000);

  it('concurrent return requests create one refundable case for a purchased line', async () => {
    const [brand] = await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${seller},'Returns','return-race-brand') RETURNING id`;
    const [product] = await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock)
      VALUES(${seller},${brand!.id},'Returns','return-race-product','RETURN-RACE',10000,50,10) RETURNING id`;
    const [sub] = await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,
      delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
      VALUES(${order},${seller},'DY-RETURN-RACE',10000,0,'seller','Test','01012345678','cairo','City','Area','Street','1') RETURNING id`;
    const [line] = await admin`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,
      quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres)
      VALUES(${sub!.id},${product!.id},'Returns','Returns','RETURN-RACE',50,1,10000,10000,'unknown',500,1,500) RETURNING id`;
    const input = { reference:'DY-CONCURRENT', phone:'01012345678', lineItemId:line!.id as string,
      reason:'defective' as const, note:'Broken atomizer', costBearer:'seller' as const, now:clock.now() };
    const aftercareA = uowA.as({ role:'aftercare', id:null });
    const aftercareB = uowB.as({ role:'aftercare', id:null });
    let signalReady!: () => void; let release!: () => void;
    const ready = new Promise<void>(resolve => { signalReady = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const winner = aftercareA.transaction(async r => {
      const result = await r.returns.request(input);
      signalReady(); await hold; return result;
    });
    let loser: Promise<unknown> | undefined;
    try {
      await ready;
      loser = aftercareB.transaction(r => r.returns.request(input));
      let blocked = false;
      for (let attempt=0; attempt<100 && !blocked; attempt++) {
        blocked = (await admin`SELECT 1 FROM pg_stat_activity WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length > 0;
        if (!blocked) await new Promise(resolve => setTimeout(resolve,20));
      }
      expect(blocked).toBe(true);
    } finally { release(); }
    expect(await winner).not.toBeNull();
    expect(await loser).toBeNull();
    expect(await admin`SELECT count(*)::int n FROM returns WHERE line_item_id=${line!.id}`).toEqual([{ n:1 }]);
  }, 60_000);

  it('a whole-parcel claim wins over a concurrent line claim without a second case', async () => {
    const [brand] = await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${seller},'Whole','whole-return-brand') RETURNING id`;
    const [product] = await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES(${seller},${brand!.id},'Whole','whole-return','WHOLE',10000,50,10) RETURNING id`;
    const [sub] = await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES(${order},${seller},'DY-WHOLE-RACE',10000,0,'seller','Test','01012345678','cairo','City','Area','Street','1') RETURNING id`;
    const [line] = await admin`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES(${sub!.id},${product!.id},'Whole','Whole','WHOLE',50,1,10000,10000,'unknown',500,1,500) RETURNING id`;
    let ready!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>{ready=r;}),hold=new Promise<void>(r=>{release=r;});
    const winner=first.begin(async tx=>{
      await tx`SELECT set_config('app.actor_role','platform',true)`;
      await tx`INSERT INTO returns(sub_order_id,reason,status,cost_bearer) VALUES(${sub!.id},'defective','requested','seller')`;
      ready();await hold;
    });
    let loser:Promise<unknown>|undefined;
    try{
      await locked;
      loser=uowB.as({role:'aftercare',id:null}).transaction(r=>r.returns.request({reference:'DY-CONCURRENT',phone:'01012345678',lineItemId:line!.id as string,reason:'defective',note:'Fault',costBearer:'seller',now:clock.now()}));
      let blocked=false;for(let n=0;n<100&&!blocked;n++){blocked=(await admin`SELECT 1 FROM pg_stat_activity WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length>0;if(!blocked)await new Promise(r=>setTimeout(r,20));}expect(blocked).toBe(true);
    }finally{release();await winner;}
    expect(await loser).toBeNull();
    expect(await admin`SELECT count(*)::int n FROM returns WHERE sub_order_id=${sub!.id}`).toEqual([{n:1}]);
  },60_000);

  it('concurrent refunds serialize their shared customer-total ceiling',async()=>{
    const [brand]=await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${seller},'Cap','refund-cap-brand') RETURNING id`;
    const [sub]=await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES(${order},${seller},'DY-CAP-RACE',30000,5000,'seller','Test','01012345678','cairo','City','Area','Street','1') RETURNING id`;
    const cases:string[]=[];
    for(const [index,price]of [10000,20000].entries()){
      const sku='CAP-'+index;
      const [product]=await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES(${seller},${brand!.id},${sku},${sku},${sku},${price},50,10) RETURNING id`;
      const [line]=await admin`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES(${sub!.id},${product!.id},${sku},'Cap',${sku},50,1,${price},${price},'unknown',500,1,${price/20}) RETURNING id`;
      const [record]=await admin`INSERT INTO returns(sub_order_id,line_item_id,reason,status,cost_bearer) VALUES(${sub!.id},${line!.id},'defective','requested','seller') RETURNING id`;
      await admin`UPDATE returns SET status='received' WHERE id=${record!.id}`;cases.push(record!.id as string);
    }
    let ready!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>{ready=r;}),hold=new Promise<void>(r=>{release=r;});
    const winner=uowA.transaction(async r=>{const ok=await r.returns.move({id:cases[0]!,expectedFrom:'received',to:'refunded',refundPiastres:15000,decidedBy:platform.id,now:clock.now()});ready();await hold;return ok;});
    let loser:Promise<unknown>|undefined;
    try{await locked;loser=uowB.transaction(r=>r.returns.move({id:cases[1]!,expectedFrom:'received',to:'refunded',refundPiastres:20001,decidedBy:platform.id,now:clock.now()})).then(value=>value,error=>error);
      let blocked=false;for(let n=0;n<100&&!blocked;n++){blocked=(await admin`SELECT 1 FROM pg_stat_activity WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length>0;if(!blocked)await new Promise(r=>setTimeout(r,20));}expect(blocked).toBe(true);
    }finally{release();}
    expect(await winner).toBe(true);expect(await loser).toBeInstanceOf(Error);
    expect(await admin`SELECT sum(amount_piastres)::int n FROM return_refund_records WHERE sub_order_id=${sub!.id}`).toEqual([{n:15000}]);
    expect(await admin`SELECT status,refund_piastres FROM returns WHERE id=${cases[1]!}`).toEqual([{status:'received',refund_piastres:null}]);
  },60_000);

  it('concurrent sibling-seller refunds cannot exceed a discounted parent order total',async()=>{
    const [other]=await admin`INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Second discount seller','Owner','discount-second-seller','live') RETURNING id`;
    const [parent]=await admin`INSERT INTO orders(reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,discount_piastres,total_piastres,payment_method)
      SELECT 'DY-DISCOUNT-CAP',customer_id,'01012345678','Test','cairo','City','Area','Street','1','unknown',20000,0,5000,15000,'cod' FROM orders WHERE id=${order} RETURNING id`;
    const cases:string[]=[];
    for(const[index,house]of [seller,other!.id as string].entries()){
      const sku='DISCOUNT-'+index;
      const [brand]=await admin`INSERT INTO brands(seller_id,name,slug) VALUES(${house},${sku},${sku}) RETURNING id`;
      const [product]=await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock) VALUES(${house},${brand!.id},${sku},${sku},${sku},10000,50,10) RETURNING id`;
      const [sub]=await admin`INSERT INTO sub_orders(order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building) VALUES(${parent!.id},${house},${'DY-DISCOUNT-CAP-'+index},10000,0,'seller','Test','01012345678','cairo','City','Area','Street','1') RETURNING id`;
      const [line]=await admin`INSERT INTO order_line_items(sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres) VALUES(${sub!.id},${product!.id},${sku},${sku},${sku},50,1,10000,10000,'unknown',500,1,500) RETURNING id`;
      const [record]=await admin`INSERT INTO returns(sub_order_id,line_item_id,reason,status,cost_bearer) VALUES(${sub!.id},${line!.id},'defective','requested','seller') RETURNING id`;
      await admin`UPDATE returns SET status='received' WHERE id=${record!.id}`;cases.push(record!.id as string);
    }
    let ready!:()=>void,release!:()=>void;let winnerError:unknown;
    const locked=new Promise<void>(r=>{ready=r;}),hold=new Promise<void>(r=>{release=r;});
    const winner=uowA.transaction(async r=>{const result=await r.returns.move({id:cases[0]!,expectedFrom:'received',to:'refunded',refundPiastres:10000,decidedBy:platform.id,now:clock.now()});ready();await hold;return result;}).catch(error=>{winnerError=error;ready();return false;});
    let loser:Promise<unknown>|undefined;
    try{
      await locked;if(winnerError)throw winnerError;
      loser=uowB.transaction(r=>r.returns.move({id:cases[1]!,expectedFrom:'received',to:'refunded',refundPiastres:10000,decidedBy:platform.id,now:clock.now()})).then(value=>value,error=>error);
      let blocked=false;for(let n=0;n<100&&!blocked;n++){blocked=(await admin`SELECT 1 FROM pg_stat_activity WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length>0;if(!blocked)await new Promise(r=>setTimeout(r,20));}expect(blocked).toBe(true);
    }finally{release();}
    expect(await winner).toBe(true);expect(await loser).toBeInstanceOf(Error);
    expect(await admin`SELECT status,refund_piastres FROM returns WHERE id=${cases[1]!}`).toEqual([{status:'received',refund_piastres:null}]);
    expect(await uowB.transaction(r=>r.returns.move({id:cases[1]!,expectedFrom:'received',to:'refunded',refundPiastres:5000,decidedBy:platform.id,now:clock.now()}))).toBe(true);
    expect(await admin`SELECT sum(f.amount_piastres)::int n FROM return_refund_records f JOIN sub_orders s ON s.id=f.sub_order_id WHERE s.order_id=${parent!.id}`).toEqual([{n:15000}]);
  },60_000);

});
