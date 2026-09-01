/**
 * Shipments, courier events and returns.
 *
 * `returns` is one of the entities DATA_MODEL.md never named, although doc 06 §8
 * defines six case types with evidence and cost responsibility. Without it there
 * is nowhere to record who pays for a failed delivery — and failed delivery is
 * the largest single cost line in the model.
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { subOrders, orderLineItems } from './orders';
import { costBearer, reasonCode, returnStatus } from './enums';

export const shipments = pgTable('shipments', {
  id: uuid('id').defaultRandom().primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  /** Never coupled to one courier — CourierPort has adapters. */
  courier: text('courier').default('bosta').notNull(),
  trackingNumber: text('tracking_number'),
  labelUrl: text('label_url'),
  deliveryAttempts: integer('delivery_attempts').default(0).notNull(),
  codAmountPiastres: integer('cod_amount_piastres'),
  codCollectedPiastres: integer('cod_collected_piastres'),
  codRemittedAt: timestamp('cod_remitted_at', { withTimezone: true }),
  proofOfDeliveryRef: text('proof_of_delivery_ref'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('shipments_sub_order_idx').on(t.subOrderId),
  index('shipments_tracking_idx').on(t.trackingNumber),
]);

export const shipmentEvents = pgTable('shipment_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  shipmentId: uuid('shipment_id').notNull().references(() => shipments.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  description: text('description'),
  location: text('location'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('shipment_events_shipment_idx').on(t.shipmentId)]);

export const returns = pgTable('returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  lineItemId: uuid('line_item_id').references(() => orderLineItems.id, { onDelete: 'set null' }),
  status: returnStatus('status').default('requested').notNull(),
  reason: reasonCode('reason').notNull(),
  customerNote: text('customer_note'),
  evidenceRefs: text('evidence_refs').array(),
  /** Doc 06 §7 — cost is allocated to a documented party, never left vague. */
  costBearer: costBearer('cost_bearer').default('unallocated').notNull(),
  refundPiastres: integer('refund_piastres'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [index('returns_sub_order_idx').on(t.subOrderId)]);
