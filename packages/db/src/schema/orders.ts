/**
 * Orders, attribution, sub-orders and line items.
 *
 * The hard part of the system. A multi-seller cart produces ONE order and N
 * sub-orders, each with its own state machine and its own SLA clocks.
 *
 * Three rules are load-bearing:
 *
 *  - `orders.source` is NOT NULL. Doc 03 §3: every order must be tagged to a
 *    source. There is no "we'll backfill it later".
 *  - `attributionTouches` keeps the trail, not just the verdict. With a 3x rate
 *    gap between seller- and marketplace-originated orders, every attribution is
 *    a potential billing dispute and must be answerable months later.
 *  - `orderLineItems.commissionBps` is a SNAPSHOT. Never compute historical
 *    commission from a seller's current rate.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { customers } from './identity';
import { sellers } from './sellers';
import { products } from './catalogue';
import {
  governorate, orderSource, paymentMethod, paymentState,
  reasonCode, subOrderState, touchChannel, transitionActor,
} from './enums';

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  reference: text('reference').notNull(),

  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  /** Phone is the identity anchor; snapshotted so a later profile edit cannot rewrite history. */
  contactPhone: text('contact_phone').notNull(),
  contactName: text('contact_name').notNull(),

  /* delivery address, snapshotted at purchase. No postal code. */
  governorate: governorate('governorate').notNull(),
  city: text('city').notNull(),
  area: text('area').notNull(),
  street: text('street').notNull(),
  building: text('building').notNull(),
  floor: text('floor'),
  apartment: text('apartment'),
  landmark: text('landmark'),

  /* attribution — required */
  source: orderSource('source').notNull(),
  sourceRef: text('source_ref'),
  attributionReason: text('attribution_reason'),
  attributionWindowsJson: text('attribution_windows_json'),
  campaignId: text('campaign_id'),
  creatorCode: text('creator_code'),
  referringSellerId: uuid('referring_seller_id').references(() => sellers.id, { onDelete: 'set null' }),

  /* money, all in integer piastres */
  merchandisePiastres: integer('merchandise_piastres').notNull(),
  shippingPiastres: integer('shipping_piastres').notNull(),
  discountPiastres: integer('discount_piastres').default(0).notNull(),
  totalPiastres: integer('total_piastres').notNull(),

  paymentMethod: paymentMethod('payment_method').notNull(),
  paymentState: paymentState('payment_state').default('pending').notNull(),
  paymentRef: text('payment_ref'),

  placedAt: timestamp('placed_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('orders_reference_key').on(t.reference),
  index('orders_customer_idx').on(t.customerId),
  index('orders_source_idx').on(t.source),
  index('orders_placed_idx').on(t.placedAt),
]);

/** The evidence behind orders.source. Kept because attribution gets disputed. */
export const attributionTouches = pgTable('attribution_touches', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  anonymousId: text('anonymous_id'),
  channel: touchChannel('channel').notNull(),
  ref: text('ref'),
  sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('attribution_touches_order_idx').on(t.orderId),
  index('attribution_touches_customer_idx').on(t.customerId),
  index('attribution_touches_anon_idx').on(t.anonymousId),
]);

/** One per seller in the cart. Own state machine, own clocks. */
export const subOrders = pgTable('sub_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  reference: text('reference').notNull(),

  state: subOrderState('state').default('placed').notNull(),

  merchandisePiastres: integer('merchandise_piastres').notNull(),
  shippingPiastres: integer('shipping_piastres').notNull(),
  commissionPiastres: integer('commission_piastres').default(0).notNull(),

  /* SLA clocks — the seller app exists to protect these */
  /**
   * Delivery details, copied from the order at placement (migration 0004).
   *
   * A house may not read `orders` — that would show it what the customer bought
   * from competing houses — so what it needs to pack and label lives here. It is
   * also a SNAPSHOT: this is where the parcel was sent, and a later edit to the
   * customer's saved address must not rewrite it.
   */
  recipientName: text('recipient_name').notNull(),
  recipientPhone: text('recipient_phone').notNull(),
  governorate: governorate('governorate').notNull(),
  city: text('city').notNull(),
  area: text('area').notNull(),
  street: text('street').notNull(),
  building: text('building').notNull(),
  floor: text('floor'),
  apartment: text('apartment'),
  landmark: text('landmark'),

  confirmDueAt: timestamp('confirm_due_at', { withTimezone: true }),
  dispatchDueAt: timestamp('dispatch_due_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('sub_orders_reference_key').on(t.reference),
  index('sub_orders_order_idx').on(t.orderId),
  index('sub_orders_seller_state_idx').on(t.sellerId, t.state),
  index('sub_orders_confirm_due_idx').on(t.confirmDueAt),
]);

/** Append-only. Every move records actor, reason and time. */
export const subOrderTransitions = pgTable('sub_order_transitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'cascade' }),
  fromState: subOrderState('from_state').notNull(),
  toState: subOrderState('to_state').notNull(),
  actor: transitionActor('actor').notNull(),
  actorId: uuid('actor_id'),
  reason: reasonCode('reason'),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('sub_order_transitions_sub_idx').on(t.subOrderId)]);

export const orderLineItems = pgTable('order_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),

  /* snapshotted product facts — a later edit must not rewrite an old order */
  productName: text('product_name').notNull(),
  brandName: text('brand_name').notNull(),
  sku: text('sku').notNull(),
  volumeMl: integer('volume_ml').notNull(),

  quantity: integer('quantity').notNull(),
  unitPricePiastres: integer('unit_price_piastres').notNull(),
  linePiastres: integer('line_piastres').notNull(),

  /* the commission SNAPSHOT — never recomputed from today's rates */
  commissionSource: orderSource('commission_source').notNull(),
  commissionBps: integer('commission_bps').notNull(),
  commissionRuleSetVersion: integer('commission_rule_set_version').notNull(),
  commissionPiastres: integer('commission_piastres').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('order_line_items_sub_idx').on(t.subOrderId)]);
