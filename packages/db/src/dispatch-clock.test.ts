/**
 * Migration 0020 — the dispatch clock, proved against a real Postgres.
 *
 * `dispatch_due_at` existed from the first migration and nothing ever wrote it.
 * These cases hold the database to the three things that were missing: the
 * house's dispatch hours are snapshotted onto every sub-order whoever writes
 * it, a deadline cannot exist before the confirmation that starts it, and the
 * orders confirmed before the fix get the clock they should always have had.
 *
 * The arithmetic of the deadline is the domain's (`SubOrderLifecycle`); what
 * is proved here is that its inputs are always present and its outputs cannot
 * be stored in an impossible shape.
 */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, applyMigrations, migrationFiles } from './migrate';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

const refuses = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the database to refuse this write, but it succeeded');
};

/** A house with a given dispatch window, a customer, and an order to hang sub-orders on. */
async function world(db: PGlite, dispatchSlaHours: number) {
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  const suffix = Math.random().toString(36).slice(2, 8);

  /*
   * This helper builds a house against TWO different schemas.
   *
   * The first block below migrates all the way up, where `contact_phone` has
   * moved to `seller_contacts` (0026). The second deliberately stops at 0020,
   * to run that migration over data written by the schema of the day — and
   * back then the column was still on `sellers`, NOT NULL. So the fixture asks
   * the database which era it is in rather than assuming, because the whole
   * point of the second block is that it is not in the present one.
   */
  const legacyContact = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'sellers' AND column_name = 'contact_phone'`);
  const hasLegacyContact = legacyContact.rows[0]!.n > 0;

  const seller = hasLegacyContact
    ? await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, dispatch_sla_hours)
       VALUES ('دار الورد', 'خالد', '01001234567', $1, $2) RETURNING id`,
      [`ward-${suffix}`, dispatchSlaHours],
    )
    : await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, dispatch_sla_hours)
       VALUES ('دار الورد', 'خالد', $1, $2) RETURNING id`,
      [`ward-${suffix}`, dispatchSlaHours],
    );
  const customer = await db.query<{ id: string }>(
    `INSERT INTO customers (phone) VALUES ('0100' || lpad((floor(random() * 10000000))::text, 7, '0')) RETURNING id`,
  );
  const order = await db.query<{ id: string }>(
    `INSERT INTO orders (reference, customer_id, contact_phone, contact_name,
       governorate, city, area, street, building, source,
       merchandise_piastres, shipping_piastres, total_piastres, payment_method)
     VALUES ('DY-' || substr(gen_random_uuid()::text,1,8), $1, '01009998877', 'أحمد',
       'cairo', 'x', 'y', 'z', '1', 'organic_search', 38000, 4500, 42500, 'cod') RETURNING id`,
    [customer.rows[0]!.id],
  );

  return { sellerId: seller.rows[0]!.id, orderId: order.rows[0]!.id };
}

/**
 * A sub-order written the way the seeder and every older fixture write one —
 * with no idea the dispatch column exists. That is the writer the trigger is for.
 */
async function subOrder(
  db: PGlite,
  w: { sellerId: string; orderId: string },
  extra: { dispatchSlaHours?: number } = {},
): Promise<string> {
  const columns = extra.dispatchSlaHours === undefined ? '' : ', dispatch_sla_hours';
  const values = extra.dispatchSlaHours === undefined ? '' : `, ${extra.dispatchSlaHours}`;
  const row = await db.query<{ id: string }>(
    `INSERT INTO sub_orders (order_id, seller_id, reference, merchandise_piastres, shipping_piastres,
       delivery_fulfilled_by, recipient_name, recipient_phone,
       governorate, city, area, street, building${columns})
     VALUES ($1, $2, 'DY-' || substr(gen_random_uuid()::text,1,8) || '-A', 38000, 4500,
       'seller', 'أحمد', '01009998877', 'cairo', 'مدينة نصر', 'السابع', 'عباس', '14'${values})
     RETURNING id`,
    [w.orderId, w.sellerId],
  );
  return row.rows[0]!.id;
}

/** Walk a sub-order to `confirmed` through the state machine trigger, stamping the time. */
async function confirm(db: PGlite, id: string, at: string): Promise<void> {
  await db.query(`UPDATE sub_orders SET state = 'awaiting_seller' WHERE id = $1`, [id]);
  await db.query(
    `UPDATE sub_orders SET state = 'confirmed', confirmed_at = $2::timestamptz WHERE id = $1`,
    [id, at],
  );
}

describe('0020 — the house’s dispatch hours are snapshotted onto every sub-order', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await applyMigrations(db);
  }, 120_000);
  afterAll(async () => { await db?.close(); });

  it('takes the HOUSE’S term when the writer does not name one', async () => {
    // 36, not the platform default of 48 — a default would pass this by accident.
    const w = await world(db, 36);
    const id = await subOrder(db, w);

    const { rows } = await db.query<{ dispatch_sla_hours: number }>(
      'SELECT dispatch_sla_hours FROM sub_orders WHERE id = $1', [id],
    );
    expect(rows[0]!.dispatch_sla_hours).toBe(36);
  });

  it('keeps the value a writer does send', async () => {
    // The checkout adapter sends the domain's snapshot explicitly. The trigger
    // fills a gap; it must never overwrite a decision.
    const w = await world(db, 36);
    const id = await subOrder(db, w, { dispatchSlaHours: 20 });

    const { rows } = await db.query<{ dispatch_sla_hours: number }>(
      'SELECT dispatch_sla_hours FROM sub_orders WHERE id = $1', [id],
    );
    expect(rows[0]!.dispatch_sla_hours).toBe(20);
  });

  it('a house changing its SLA does NOT rewrite the orders it already accepted', async () => {
    const w = await world(db, 48);
    const id = await subOrder(db, w);

    await db.query('UPDATE sellers SET dispatch_sla_hours = 12 WHERE id = $1', [w.sellerId]);

    const { rows } = await db.query<{ dispatch_sla_hours: number }>(
      'SELECT dispatch_sla_hours FROM sub_orders WHERE id = $1', [id],
    );
    expect(rows[0]!.dispatch_sla_hours, 'the promise made at placement changed afterwards').toBe(48);
  });

  it('refuses a dispatch window of zero hours', async () => {
    const w = await world(db, 48);
    const message = await refuses(() => subOrder(db, w, { dispatchSlaHours: 0 }));
    expect(message).toMatch(/sub_orders_dispatch_sla_positive/);
  });

  it('refuses a dispatch deadline on an order nobody has confirmed', async () => {
    // A house cannot be late shipping an order it has not agreed to take.
    const w = await world(db, 48);
    const id = await subOrder(db, w);
    const message = await refuses(() => db.query(
      `UPDATE sub_orders SET dispatch_due_at = now() + interval '1 day' WHERE id = $1`, [id],
    ));
    expect(message).toMatch(/sub_orders_dispatch_due_after_confirm/);
  });

  it('refuses a dispatch deadline that falls before its own confirmation', async () => {
    const w = await world(db, 48);
    const id = await subOrder(db, w);
    await confirm(db, id, '2026-09-10T10:00:00Z');

    const message = await refuses(() => db.query(
      `UPDATE sub_orders SET dispatch_due_at = '2026-09-10T09:00:00Z' WHERE id = $1`, [id],
    ));
    expect(message).toMatch(/sub_orders_dispatch_due_after_confirm/);
  });
});

describe('0020 — orders confirmed before the fix get the clock they should have had', () => {
  let db: PGlite;
  let before: string;
  let through0020: string;

  beforeAll(async () => {
    /*
     * The real migration history, stopped one short.
     *
     * The ledger skips files it has already applied, so building 0000–0019 from
     * a copy and then pointing the SAME database at the real directory applies
     * exactly 0020 over data written by the old schema — which is the only
     * honest test of a backfill.
     */
    before = mkdtempSync(join(tmpdir(), 'diyar-0019-'));
    for (const file of migrationFiles().filter((f) => f < '0020')) {
      copyFileSync(join(MIGRATIONS_DIR, file), join(before, file));
    }
    /*
     * The second step stops AT 0020 too, rather than pointing at the live
     * directory. This test proves one migration; the first version applied the
     * real directory and broke the day 0021 was written, asserting on a
     * migration it had nothing to say about.
     */
    through0020 = mkdtempSync(join(tmpdir(), 'diyar-0020-'));
    for (const file of migrationFiles().filter((f) => f <= '0020_dispatch_clock.sql')) {
      copyFileSync(join(MIGRATIONS_DIR, file), join(through0020, file));
    }
    db = new PGlite();
    await applyMigrations(db, { dir: before });
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    rmSync(before, { recursive: true, force: true });
    rmSync(through0020, { recursive: true, force: true });
  });

  it('backfills the snapshot and the deadline, and leaves unconfirmed orders without one', async () => {
    const w = await world(db, 30);

    // Written under 0019: the column does not exist yet.
    const confirmed = await subOrder(db, w);
    await confirm(db, confirmed, '2026-09-10T08:00:00Z');
    const waiting = await subOrder(db, w);

    const applied = await applyMigrations(db, { dir: through0020 });
    expect(applied, 'only 0020 should run over the old schema').toEqual(['0020_dispatch_clock.sql']);

    await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
    const { rows } = await db.query<{ id: string; dispatch_sla_hours: number; due: string | null }>(
      `SELECT id, dispatch_sla_hours, to_char(dispatch_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS due
         FROM sub_orders WHERE id = ANY($1::uuid[])`,
      [[confirmed, waiting]],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(confirmed)!.dispatch_sla_hours).toBe(30);
    // Confirmed at 08:00, thirty hours to ship: due at 14:00 the next day.
    expect(byId.get(confirmed)!.due).toBe('2026-09-11T14:00');

    expect(byId.get(waiting)!.dispatch_sla_hours).toBe(30);
    expect(byId.get(waiting)!.due, 'an unconfirmed order has no dispatch deadline yet').toBeNull();
  });
});
