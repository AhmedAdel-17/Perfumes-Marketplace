/**
 * P1.2.4: two independent PostgreSQL sessions compete for the same sub-order.
 * Explicit disposable localhost URL only; never falls back to DATABASE_URL.
 * PGlite cannot establish this lock behaviour because it serializes writers.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, InvalidTransition, SubOrderLifecycle } from '@diyar/domain';
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
  it('serializes one checkout key across connections, including UUID case variants', async () => {
    const checkoutA = uowA.as({ role: 'checkout', id: null });
    const checkoutB = uowB.as({ role: 'checkout', id: null });
    const key = crypto.randomUUID();
    const response = { reference: 'DY-ONE', totalPiastres: 15000, houseCount: 1, etaDaysMin: 3, etaDaysMax: 4 };
    let workCount = 0;
    let signalReady!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const winner = checkoutA.transaction(async (r) => {
      expect(await r.checkoutReplay.lockAndRead(key, clock.now())).toBeNull();
      workCount++;
      await r.checkoutReplay.save(key, { requestHash: 'a'.repeat(64), response },
        new Date('2026-10-19T00:00:00Z'));
      signalReady();
      await hold;
      return response;
    });
    let loser: Promise<unknown> | undefined;
    try {
      await ready;
      loser = checkoutB.transaction(async (r) => {
        const found = await r.checkoutReplay.lockAndRead(key.toUpperCase(), clock.now());
        if (!found) workCount++;
        return found?.response;
      });
      let blocked = false;
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        blocked = (await admin`SELECT 1 FROM pg_stat_activity
          WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
    } finally { release(); await winner; }
    expect(await loser).toEqual(response);
    expect(workCount).toBe(1);
  });

  it('serializes inventory reservations so concurrent checkouts cannot oversell', async () => {
    const [brand] = await admin`INSERT INTO brands(seller_id,name,slug)
      VALUES(${seller},'Concurrent inventory','concurrent-inventory-brand') RETURNING id`;
    const [product] = await admin`INSERT INTO products
      (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock)
      VALUES(${seller},${brand!.id},'Inventory','concurrent-inventory-product','INV-CONCURRENT',10000,50,5)
      RETURNING id`;
    await first.unsafe("SET app.actor_role='checkout'");
    await second.unsafe("SET app.actor_role='checkout'");
    const keyA = crypto.randomUUID(); const keyB = crypto.randomUUID();
    let signalReady!: () => void; let release!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const winner = first.begin(async (tx) => {
      const rows = await tx`SELECT app.reserve_inventory(${product!.id},4,${keyA},now()+interval '15 minutes') AS id`;
      signalReady(); await hold; return rows[0]!.id;
    });
    let loser: Promise<unknown> | undefined;
    try {
      await ready;
      loser = second.begin((tx) => tx`SELECT app.reserve_inventory(${product!.id},4,${keyB},now()+interval '15 minutes')`)
        .then(() => null, (error: unknown) => error);
      let blocked = false;
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        blocked = (await admin`SELECT 1 FROM pg_stat_activity
          WHERE application_name='diyar_transition_second' AND wait_event_type='Lock'`).length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve,20));
      }
      expect(blocked).toBe(true);
    } finally { release(); await winner; }
    expect(await loser).toBeInstanceOf(Error);
    expect(await admin`SELECT on_hand,reserved FROM inventory_balances WHERE product_id=${product!.id}`)
      .toEqual([{ on_hand:5, reserved:4 }]);
    expect(await admin`SELECT id FROM inventory_reservations WHERE product_id=${product!.id}`)
      .toHaveLength(1);
  });

});
