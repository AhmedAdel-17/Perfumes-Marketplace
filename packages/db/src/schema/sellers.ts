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

  /*
   * `contactPhone` and `contactEmail` USED TO BE HERE and are now in
   * `sellerContacts` (migration 0026). They moved because this row is read by
   * anonymous traffic — `public_read_live_sellers` admits every actor to the
   * whole row of any live house, and Postgres has no column-level row security
   * to keep two of its columns back. Nothing that renders a storefront needs
   * them. Do not add a contact field here.
   */

  status: sellerStatus('status').default('applied').notNull(),

  /** Storefront — an acquisition surface and an attribution source. */
  slug: text('slug').notNull(),
  bio: text('bio'),
  story: text('story'),
  /** English bio and story (0030). Optional; the storefront falls back to the Arabic. */
  bioEn: text('bio_en'),
  storyEn: text('story_en'),
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

  /** What the applicant wrote about their house, in their own words (0018). */
  applicationNote: text('application_note'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),

  approvedAt: timestamp('approved_at', { withTimezone: true }),
  liveAt: timestamp('live_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('sellers_slug_key').on(t.slug),
  index('sellers_status_idx').on(t.status),
]);

/**
 * A house's contact details — private, and off the public row.
 *
 * ONE TABLE RATHER THAN TWO COLUMNS because RLS in Postgres is per ROW. The
 * catalogue has to expose a live house to anonymous visitors, so any column on
 * `sellers` is a column anonymous visitors can select. Moving the two fields to
 * a table with no public policy is the only arrangement where the guarantee is
 * the database's rather than a convention about which queries get written.
 *
 * Reachable by exactly three parties, and each one is a policy in 0026 rather
 * than a rule in code: operators, the house itself, and the intake role at the
 * moment an application is created. Sign-in resolution reads it through the
 * privileged connection, which is a separate problem (DEBT #14) and P3.4.1's.
 */
export const sellerContacts = pgTable('seller_contacts', {
  sellerId: uuid('seller_id').primaryKey()
    .references(() => sellers.id, { onDelete: 'cascade' }),
  contactPhone: text('contact_phone').notNull(),
  contactEmail: text('contact_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('seller_contacts_phone_idx').on(t.contactPhone)]);

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
