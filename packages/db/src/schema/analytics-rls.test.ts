/**
 * The browsing trail, at the database boundary — migration 0023.
 *
 * A-1 permits recording browsing events with "no personal data in the event".
 * That sentence is only worth anything if the database refuses the row, so every
 * clause of the WITH CHECK is a case here: no customer, no payload (so a search
 * is counted and its words are not), no source or campaign, no order, a
 * well-formed anonymous id, and a name from the vocabulary.
 *
 * Also proved: the writing role cannot read back what it wrote, an ordinary
 * visitor cannot write at all, and the retention sweep deletes by age and
 * refuses anyone but the platform.
 */
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrate';

let db: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const VISITOR = 'a1b2c3d4e5f6a7b8c9d0e1f2';

const asActor = async <T>(role: string, sql: string, params: unknown[] = []) => {
  await db.exec(`SET LOCAL app.actor_role = '${role}'`);
  await db.exec("SET LOCAL app.actor_id = ''");
  await db.exec('SET LOCAL ROLE app_user');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('RESET ROLE').catch(() => undefined);
  }
};

const within = async <T>(fn: () => Promise<T>): Promise<T> => {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
};

/** The write the shop actually makes: five columns, and no more. */
const record = (
  columns = 'name, anonymous_id',
  values = `'product_view', '${VISITOR}'`,
) => asActor('analytics', `INSERT INTO analytics_events (${columns}) VALUES (${values})`);

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
}, 180_000);

describe('what the analytics role may write', () => {
  it('records an event with a name, a visitor, and the perfume it is about', () => within(async () => {
    await expect(record(
      'name, anonymous_id, product_id',
      `'product_view', '${VISITOR}', '11111111-1111-4111-8111-111111111111'`,
    )).resolves.toBeDefined();

    const seen = await asActor<{ n: number }>('platform', 'SELECT count(*)::int AS n FROM analytics_events');
    expect(seen.rows[0]!.n).toBe(1);
  }));

  it.each([
    ['a customer id', 'name, anonymous_id, customer_id', `'product_view', '${VISITOR}', '22222222-2222-4222-8222-222222222222'`],
    ['a payload — this is the search text', 'name, anonymous_id, payload', `'search', '${VISITOR}', '{"q":"عطر أحمد 01001234567"}'`],
    ['a source', 'name, anonymous_id, source', `'landing_view', '${VISITOR}', 'paid_social'`],
    ['a campaign', 'name, anonymous_id, campaign_id', `'landing_view', '${VISITOR}', 'ramadan-2026'`],
    ['an order id', 'name, anonymous_id, order_id', `'cart_add', '${VISITOR}', '33333333-3333-4333-8333-333333333333'`],
    ['an anonymous id of the wrong shape', 'name, anonymous_id', `'product_view', 'ahmed@example.com'`],
    ['an event name nobody fires', 'name, anonymous_id', `'wishlist_add', '${VISITOR}'`],
    ['a post-order event that belongs to the order graph', 'name, anonymous_id', `'delivered', '${VISITOR}'`],
  ])('refuses %s', (_what, columns, values) => within(async () => {
    await expect(record(columns, values)).rejects.toThrow();
  }));

  it('cannot read back what it wrote', () => within(async () => {
    await record();
    // No SELECT policy for this role, on purpose: the shop writes, the owner's
    // report reads as platform. A role that could read this table could read
    // one visitor's trail.
    const own = await asActor<{ id: string }>('analytics', 'SELECT id FROM analytics_events');
    expect(own.rows).toEqual([]);
  }));

  it.each(['anon', 'customer', 'seller'])('a %s visitor cannot write one', (role) => within(async () => {
    await expect(asActor(role,
      `INSERT INTO analytics_events (name, anonymous_id) VALUES ('product_view', '${VISITOR}')`))
      .rejects.toThrow();
  }));
});

describe('retention', () => {
  const purge = (days: number, role = 'platform') =>
    asActor<{ purge_analytics_events: number }>(role,
      'SELECT app.purge_analytics_events($1) AS purge_analytics_events', [days]);

  it('deletes events older than the window and keeps the rest', () => within(async () => {
    await db.exec("SET LOCAL app.actor_role = 'platform'");
    await db.exec('SET LOCAL ROLE app_user');
    await db.query(
      `INSERT INTO analytics_events (name, anonymous_id, occurred_at) VALUES
         ('product_view', $1, now() - interval '200 days'),
         ('product_view', $1, now() - interval '181 days'),
         ('product_view', $1, now() - interval '10 days')`, [VISITOR]);
    await db.exec('RESET ROLE');

    const removed = await purge(180);
    expect(Number(removed.rows[0]!.purge_analytics_events)).toBe(2);

    const left = await asActor<{ n: number }>('platform', 'SELECT count(*)::int AS n FROM analytics_events');
    expect(left.rows[0]!.n).toBe(1);
  }));

  it.each(['anon', 'analytics', 'seller'])('refuses to run as %s', (role) => within(async () => {
    await expect(purge(180, role)).rejects.toThrow();
  }));

  it.each([0, -1])('refuses a window of %i days, which would delete everything', (days) => within(async () => {
    await expect(purge(days)).rejects.toThrow();
  }));
});
