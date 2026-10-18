/** Idempotent checkout responses, isolated from seller/customer reads by RLS. */
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CheckoutResponse } from '@diyar/domain';
export const checkoutRequests = pgTable('checkout_requests', {
  key: uuid('key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  response: jsonb('response').$type<CheckoutResponse>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [index('checkout_requests_expiry_idx').on(t.expiresAt)]);
