/**
 * The browsing trail through the real router — WORK_PLAN 9.5.
 *
 * What is proved here and nowhere else: a visitor who is NOBODY can cause a row
 * to be written. The contract proves the adapter counts; the RLS test proves the
 * policy refuses the wrong shapes; this proves the router actually reaches the
 * `analytics` service role, because an anonymous caller's own role cannot insert
 * and a mis-wired context would fail exactly here.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@diyar/domain';
import { DrizzleUnitOfWork, schema, type ActorContext, type DiyarDatabase } from '@diyar/db';
import { applyMigrations } from '@diyar/db/migrate';
import { appRouter } from './routers/index';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';

const NOW = new Date('2026-09-16T09:00:00Z');
const CLOCK = new FixedClock(NOW);
const MEDIA = testMediaStore();

const ANON: ActorContext = { role: 'anon', id: null };
const PLATFORM: ActorContext = { role: 'platform', id: '99999999-9999-9999-9999-999999999999' };

let pg: PGlite;
let db: DiyarDatabase;

const caller = (actor: ActorContext) => {
  const ctx: ApiContext = {
    actor,
    sellerId: null,
    platformStaffId: null,
    platformRole: null,
    platformLabel: null,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    aftercareUow: new DrizzleUnitOfWork(db, { role: 'aftercare', id: null }),
    intakeUow: new DrizzleUnitOfWork(db, { role: 'intake', id: null }),
    analyticsUow: new DrizzleUnitOfWork(db, { role: 'analytics', id: null }),
    media: MEDIA,
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

/** Counts read as the platform, the way the owner's report will. */
const counts = () => new DrizzleUnitOfWork(db, PLATFORM).transaction((r) =>
  r.analytics.countsInPeriod(new Date(NOW.getTime() - 60_000), new Date(NOW.getTime() + 60_000)));

let visitors = 0;
const visitor = () => {
  visitors += 1;
  return visitors.toString(16).padStart(24, '0');
};

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
}, 180_000);

afterAll(async () => { await pg?.close(); });

describe('analytics.record', () => {
  it('records an anonymous visitor’s view — through the service role, not the visitor’s own', async () => {
    const anonymousId = visitor();
    const result = await caller(ANON).analytics.record({
      name: 'product_view',
      anonymousId,
      productId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result).toEqual({ recorded: true });
    const [row] = (await counts()).filter((c) => c.name === 'product_view');
    expect(row?.events).toBeGreaterThanOrEqual(1);
  });

  it('stamps the server’s clock, never a time the caller sent', async () => {
    // There is no field for it, which is the point: a client-supplied timestamp
    // is a client-supplied place in the funnel.
    await caller(ANON).analytics.record({ name: 'landing_view', anonymousId: visitor() });

    const outside = await new DrizzleUnitOfWork(db, PLATFORM).transaction((r) =>
      r.analytics.countsInPeriod(new Date(NOW.getTime() + 60_000), new Date(NOW.getTime() + 120_000)));
    expect(outside).toEqual([]);
  });

  it('refuses a name outside the vocabulary, at the boundary', async () => {
    await expect(caller(ANON).analytics.record({
      // A post-order event: measured from the order graph, never from a browser.
      name: 'delivered' as 'product_view',
      anonymousId: visitor(),
    })).rejects.toThrow();
  });

  it('refuses an anonymous id that is not one this site issued', async () => {
    await expect(caller(ANON).analytics.record({
      name: 'product_view',
      anonymousId: 'ahmed@example.com',
    })).rejects.toThrow();
  });

  it('stops one browser flooding the table, and says so without failing', async () => {
    const anonymousId = visitor();
    const results: boolean[] = [];
    for (let i = 0; i < 302; i += 1) {
      const { recorded } = await caller(ANON).analytics.record({ name: 'landing_view', anonymousId });
      results.push(recorded);
    }

    // The limit is a courtesy, so passing it is not an error — the page carries
    // on and the event is simply not recorded.
    expect(results.filter(Boolean).length).toBe(300);
    expect(results.at(-1)).toBe(false);
  }, 60_000);
});
