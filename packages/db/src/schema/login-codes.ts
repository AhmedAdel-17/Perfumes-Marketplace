/**
 * One-time sign-in codes (migration 0025).
 *
 * The code itself is NOT here — only a SHA-256 digest of the code and the phone
 * together. A table is dumped, replicated and restored, and a plaintext
 * one-time code in a backup is a credential in a backup. The in-memory `Map`
 * this replaces held plaintext, which was defensible only because it died with
 * the process.
 *
 * Nothing reads a row back. Verification goes through `app.verify_login_code`,
 * which compares and consumes under the row's own lock, so the attempt ceiling
 * holds under concurrent guessing — which is the only condition where a ceiling
 * matters.
 */
import { check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const loginCodes = pgTable('login_codes', {
  /**
   * The phone is the identity everywhere else in this system, and it is the
   * natural key here: one pending code per number, so pressing "send it again"
   * replaces rather than accumulates.
   */
  phone: text('phone').primaryKey(),
  /** 'seller' | 'platform' — a house's code must not open the console. */
  audience: text('audience').notNull(),
  /** SHA-256 of code + phone, 64 lowercase hex characters. Never the code. */
  codeDigest: text('code_digest').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Counted before the comparison, so a wrong guess always costs one. */
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('login_codes_expires_idx').on(t.expiresAt),
  check('login_codes_audience_known', sql`${t.audience} IN ('seller', 'platform')`),
  check('login_codes_digest_shape', sql`${t.codeDigest} ~ '^[0-9a-f]{64}$'`),
  check('login_codes_attempts_sane', sql`${t.attempts} >= 0`),
]);
