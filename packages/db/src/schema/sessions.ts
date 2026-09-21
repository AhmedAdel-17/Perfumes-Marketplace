/**
 * Signed-in sessions (migration 0028).
 *
 * One row per sign-in. The cookie carries the id and an HMAC of it; everything
 * that matters about the session is here, where it can be revoked. Immutable
 * except `revoked_at`, which is set once — a database trigger refuses anything
 * else, so a session cannot be extended, moved or un-revoked from code.
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sellers } from './sellers';

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** `seller` or `platform`. A house's session never opens the console. */
  audience: text('audience').notNull(),
  /** Staff `auth_user_id` for a house; `platform_staff.id` for an operator. */
  principalId: uuid('principal_id').notNull(),
  sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'cascade' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  /** Keyed hashes, never raw values — see 0028 on why a plain hash is not enough. */
  ipHash: text('ip_hash'),
  uaHash: text('ua_hash'),
}, (t) => [index('sessions_open_by_principal_idx').on(t.audience, t.principalId)]);
