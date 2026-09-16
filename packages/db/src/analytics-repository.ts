/**
 * Drizzle adapter for `AnalyticsRepository` — WORK_PLAN 9.5.
 *
 * Held to the same contract as the in-memory adapter (`analytics-contract.ts`).
 *
 * The write fills five columns and leaves the rest of `analytics_events` null,
 * which is the whole privacy design: no `customer_id`, no `payload`, no source
 * or campaign. Migration 0023 refuses a row that fills them, so this is not the
 * only thing standing between a browsing trail and personal data.
 */
import { and, countDistinct, gte, lt, sql } from 'drizzle-orm';
import type {
  AnalyticsRepository, BrowsingCount, BrowsingEvent,
} from '@diyar/domain';
import * as schema from './schema';
import type { DiyarDatabase } from './repositories';

export const analyticsRepository = (db: DiyarDatabase): AnalyticsRepository => ({
  async record(event) {
    await db.insert(schema.analyticsEvents).values({
      name: event.name,
      anonymousId: event.anonymousId,
      productId: event.productId,
      sellerId: event.sellerId,
      occurredAt: event.occurredAt,
    });
  },

  async countsInPeriod(from, to) {
    const rows = await db
      .select({
        name: schema.analyticsEvents.name,
        // `count(*)` over the group, and DISTINCT ids — one person refreshing is
        // one visitor. Counted in SQL rather than by reading the rows out: the
        // report must never be able to load a visitor's trail into memory.
        events: sql<number>`count(*)`,
        visitors: countDistinct(schema.analyticsEvents.anonymousId),
      })
      .from(schema.analyticsEvents)
      // Half-open, like every other period here.
      .where(and(
        gte(schema.analyticsEvents.occurredAt, from),
        lt(schema.analyticsEvents.occurredAt, to),
      ))
      .groupBy(schema.analyticsEvents.name);

    return rows.map((row): BrowsingCount => ({
      // The column is text and 0023 CHECKs it against the same vocabulary, so
      // this narrows what the database already guarantees.
      name: row.name as BrowsingEvent,
      // postgres returns bigint counts as strings through some drivers.
      events: Number(row.events),
      visitors: Number(row.visitors),
    }));
  },
});

/**
 * Exported for the retention sweep's test, not for the application: nothing at
 * request time deletes analytics. See migration 0023 and DEBT_REGISTER.
 */
export const purgeAnalyticsOlderThan = async (db: DiyarDatabase, cutoff: Date): Promise<void> => {
  await db.delete(schema.analyticsEvents).where(lt(schema.analyticsEvents.occurredAt, cutoff));
};
