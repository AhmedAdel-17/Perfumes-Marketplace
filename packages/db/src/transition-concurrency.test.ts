/**
 * P1.2.4: two independent PostgreSQL sessions compete for the same sub-order.
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
    const [product] = await admin`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
      VALUES(${seller},${brand!.id},'Payout','payout-product','PAYOUT',10000,50) RETURNING id`;
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

});
