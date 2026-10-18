/**
 * Pattern — Idempotent Command via a transaction-scoped advisory key lock.
 * A hash collision only serializes unrelated keys; full UUID equality decides
 * replay identity. Locks vanish on rollback and no pending claim can survive.
 */
import { eq, sql } from 'drizzle-orm';
import type { CheckoutReplayRepository } from '@diyar/domain';
import type { DiyarDatabase } from './repositories';
import { checkoutRequests } from './schema/checkout-replay';
export const checkoutReplayRepository = (db: DiyarDatabase): CheckoutReplayRepository => ({
  async lockAndRead(key, now) {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('checkout:' || ${key}::uuid::text, 0))`);
    const [row] = await db.select().from(checkoutRequests).where(eq(checkoutRequests.key, key));
    return row && row.expiresAt > now ? { requestHash: row.requestHash, response: row.response } : null;
  },
  async save(key, replay, expiresAt) {
    const values = { key, ...replay, expiresAt };
    await db.insert(checkoutRequests).values(values)
      .onConflictDoUpdate({ target: checkoutRequests.key, set: values });
  },
});
