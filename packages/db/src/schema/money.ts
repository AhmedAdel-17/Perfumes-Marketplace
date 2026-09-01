/**
 * Commission rules, payouts, statements and adjustments.
 *
 * The ledger is deliberately independent of WHO holds the cash.
 *
 * D-5 (whether the entity may legally hold customer funds) is unresolved. It
 * decides settlement, not accounting: what is owed to whom on every order is the
 * same in both worlds. Recording that here means the fallback from "we pay them"
 * to "we bill them" costs the last step only, not the system.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sellers } from './sellers';
import { subOrders } from './orders';
import { adjustmentType, orderSource, payoutStatus } from './enums';

/** Versioned. A statement cites the version that produced it. */
export const commissionRuleSets = pgTable('commission_rule_sets', {
  id: uuid('id').defaultRandom().primaryKey(),
  version: integer('version').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  /** Doc 04 §9: neither founder changes economics alone. */
  approvedBy: text('approved_by').array().notNull(),
  storefrontReferralBps: integer('storefront_referral_bps').notNull(),
  directRepeatBps: integer('direct_repeat_bps').notNull(),
  organicSearchBps: integer('organic_search_bps').notNull(),
  paidCampaignBps: integer('paid_campaign_bps').notNull(),
  creatorAffiliateBps: integer('creator_affiliate_bps').notNull(),
  emailCrmBps: integer('email_crm_bps').notNull(),
  unknownBps: integer('unknown_bps').notNull(),
  storefrontWindowDays: integer('storefront_window_days').default(30).notNull(),
  campaignWindowDays: integer('campaign_window_days').default(7).notNull(),
  creatorWindowDays: integer('creator_window_days').default(7).notNull(),
  emailWindowDays: integer('email_window_days').default(7).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('commission_rule_sets_version_key').on(t.version)]);

export const commissionOverrides = pgTable('commission_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  ruleSetId: uuid('rule_set_id').notNull().references(() => commissionRuleSets.id, { onDelete: 'cascade' }),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  source: orderSource('source').notNull(),
  bps: integer('bps').notNull(),
  note: text('note'),
}, (t) => [uniqueIndex('commission_overrides_unique').on(t.ruleSetId, t.sellerId, t.source)]);

export const payouts = pgTable('payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  reference: text('reference').notNull(),
  status: payoutStatus('status').default('accruing').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),

  grossPiastres: integer('gross_piastres').default(0).notNull(),
  commissionPiastres: integer('commission_piastres').default(0).notNull(),
  shippingPiastres: integer('shipping_piastres').default(0).notNull(),
  refundsPiastres: integer('refunds_piastres').default(0).notNull(),
  adjustmentsPiastres: integer('adjustments_piastres').default(0).notNull(),
  netPiastres: integer('net_piastres').default(0).notNull(),

  /** Every payout has an itemized statement and a dispute deadline (doc 03 §7). */
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  disputeDeadline: timestamp('dispute_deadline', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  approvedBy: uuid('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('payouts_reference_key').on(t.reference),
  index('payouts_seller_status_idx').on(t.sellerId, t.status),
]);

/** One line per completed sub-order. This is what makes a statement checkable. */
export const payoutLines = pgTable('payout_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  payoutId: uuid('payout_id').notNull().references(() => payouts.id, { onDelete: 'cascade' }),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  grossPiastres: integer('gross_piastres').notNull(),
  commissionPiastres: integer('commission_piastres').notNull(),
  commissionSource: orderSource('commission_source').notNull(),
  commissionBps: integer('commission_bps').notNull(),
  shippingPiastres: integer('shipping_piastres').notNull(),
  netPiastres: integer('net_piastres').notNull(),
}, (t) => [
  uniqueIndex('payout_lines_unique').on(t.payoutId, t.subOrderId),
  index('payout_lines_payout_idx').on(t.payoutId),
]);

/** Acceptance gate 6: every fee change and payout adjustment is auditable. */
export const adjustments = pgTable('adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  payoutId: uuid('payout_id').references(() => payouts.id, { onDelete: 'set null' }),
  subOrderId: uuid('sub_order_id').references(() => subOrders.id, { onDelete: 'set null' }),
  type: adjustmentType('type').notNull(),
  amountPiastres: integer('amount_piastres').notNull(),
  reason: text('reason').notNull(),
  createdBy: uuid('created_by').notNull(),
  approvedBy: uuid('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('adjustments_seller_idx').on(t.sellerId)]);
