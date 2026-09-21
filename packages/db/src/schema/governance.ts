/**
 * Audit, consent, analytics and webhook ingestion.
 *
 * DATA_MODEL.md: "Retrofitting an audit log is not feasible." It is therefore in
 * the first migration, append-only at the database level, and no application
 * role may update or delete a row in it.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { customers } from './identity';
import {
  auditAction, consentPurpose, privacyRequestStatus, privacyRequestType,
  ticketPriority, ticketStatus,
} from './enums';
import { sellers } from './sellers';
import { orders, subOrders } from './orders';

/** Append-only. Acceptance gate 6. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  action: auditAction('action').notNull(),
  actorId: uuid('actor_id'),
  actorLabel: text('actor_label').notNull(),
  entityTable: text('entity_table').notNull(),
  entityId: uuid('entity_id'),
  before: text('before'),
  after: text('after'),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  /**
   * The request that wrote this entry (migration 0029). Deliberately NEVER set
   * from code: the database fills it from `app.request_id`, which the Unit of
   * Work sets per transaction, so no router can forget it.
   */
  requestId: uuid('request_id'),
}, (t) => [
  index('audit_log_entity_idx').on(t.entityTable, t.entityId),
  index('audit_log_occurred_idx').on(t.occurredAt),
]);

/** PDPL 151/2020: consent and purpose records. */
export const consentRecords = pgTable('consent_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  purpose: consentPurpose('purpose').notNull(),
  granted: text('granted').notNull(),
  source: text('source').notNull(),
  ipHash: text('ip_hash'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('consent_records_customer_idx').on(t.customerId)]);

/** PDPL: a documented process for export and delete requests. */
export const privacyRequests = pgTable('privacy_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  contactPhone: text('contact_phone').notNull(),
  type: privacyRequestType('type').notNull(),
  status: privacyRequestStatus('status').default('received').notNull(),
  handledBy: uuid('handled_by'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The doc 04 §6 taxonomy. Every event carries order source and campaign fields.
 * Internal table is the source of truth; a third-party tool never reconciles
 * with money.
 */
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  anonymousId: text('anonymous_id'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'set null' }),
  productId: uuid('product_id'),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  source: text('source'),
  campaignId: text('campaign_id'),
  payload: text('payload'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('analytics_events_name_idx').on(t.name, t.occurredAt),
  index('analytics_events_customer_idx').on(t.customerId),
]);

/**
 * Webhook dedupe. Paymob and Bosta WILL deliver duplicates and out-of-order
 * events, and these are money paths — so every inbound event is recorded by
 * provider event id before it is processed.
 */
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  attempts: integer('attempts').default(0).notNull(),
  lastError: text('last_error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('webhook_events_provider_key').on(t.provider, t.providerEventId)]);

/**
 * Support. Doc 06 §9 specifies the case fields; doc 06 §6 requires ONE customer
 * timeline across every seller and courier event, which an off-the-shelf
 * helpdesk cannot render without order context.
 */
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  reference: text('reference').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  subOrderId: uuid('sub_order_id').references(() => subOrders.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'set null' }),
  priority: ticketPriority('priority').default('p3').notNull(),
  status: ticketStatus('status').default('open').notNull(),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  /** What the person actually wrote. Added in 0017 — see the note there. */
  message: text('message').notNull(),
  /**
   * How to reach them back.
   *
   * On the ticket rather than resolved through `customers`, because the whole
   * product is built around guests and a question is not a purchase.
   * `customerId` above is filled in only when the phone already belongs to one.
   */
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  ownerId: uuid('owner_id'),
  nextAction: text('next_action'),
  resolutionCode: text('resolution_code'),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('support_tickets_reference_key').on(t.reference),
  index('support_tickets_status_idx').on(t.status, t.priority),
]);

/**
 * Marketplace operators.
 *
 * Separate from `seller_staff` deliberately: these are different people with
 * different authority, and one table with a nullable seller_id would let a
 * mistake in one query grant a house platform rights. Two tables cannot be
 * confused by accident.
 */
export const platformStaff = pgTable('platform_staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  authUserId: uuid('auth_user_id').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  role: text('role').default('operator').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('platform_staff_auth_user_key').on(t.authUserId),
  index('platform_staff_active_phone_idx').on(t.phone),
]);
