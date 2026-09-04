/**
 * Sellers ("houses"), their verification controls, and their staff.
 *
 * DATA_MODEL.md: "A seller cannot reach `live` with an incomplete checklist.
 * There is no self-approval path." That is enforced by a database trigger
 * (see migrations/0001_constraints.sql), not by the admin UI alone.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  deliveryFulfilledBy, governorate, sellerStatus, staffRole,
  verificationControl, verificationStatus,
} from './enums';

export const sellers = pgTable('sellers', {
  id: uuid('id').defaultRandom().primaryKey(),

  legalName: text('legal_name'),
  tradingName: text('trading_name').notNull(),
  ownerName: text('owner_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  contactEmail: text('contact_email'),

  status: sellerStatus('status').default('applied').notNull(),

  /** Storefront — an acquisition surface and an attribution source. */
  slug: text('slug').notNull(),
  bio: text('bio'),
  story: text('story'),
  foundedYear: integer('founded_year'),
  city: text('city'),
  serviceGovernorates: governorate('service_governorates').array(),

  /** Operational commitments (doc 06 §5). Policy values, not constants in code. */
  confirmationSlaHours: integer('confirmation_sla_hours').default(24).notNull(),
  dispatchSlaHours: integer('dispatch_sla_hours').default(48).notNull(),
  escalationContact: text('escalation_contact'),
  privacyContact: text('privacy_contact'),

  /** Money terms. Reserve period is why payouts are not immediate. */
  /** Default for new orders. Snapshotted onto each sub-order at placement. */
  deliveryFulfilledBy: deliveryFulfilledBy('delivery_fulfilled_by').default('seller').notNull(),
  payoutReserveDays: integer('payout_reserve_days').default(7).notNull(),
  disputeWindowDays: integer('dispute_window_days').default(7).notNull(),

  approvedAt: timestamp('approved_at', { withTimezone: true }),
  liveAt: timestamp('live_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('sellers_slug_key').on(t.slug),
  index('sellers_status_idx').on(t.status),
]);

/** One row per control in doc 06 §3, each with its own evidence and reviewer. */
export const sellerVerifications = pgTable('seller_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  control: verificationControl('control').notNull(),
  status: verificationStatus('status').default('pending').notNull(),
  evidenceRef: text('evidence_ref'),
  notes: text('notes'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('seller_verifications_unique').on(t.sellerId, t.control)]);

/** Role-based access is an MVP requirement: staff must not see what owners see. */
export const sellerStaff = pgTable('seller_staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  authUserId: uuid('auth_user_id').notNull(),
  role: staffRole('role').default('viewer').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('seller_staff_unique').on(t.sellerId, t.authUserId),
  index('seller_staff_user_idx').on(t.authUserId),
]);
