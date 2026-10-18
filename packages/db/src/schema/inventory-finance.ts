import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { products } from './catalogue';
import { orders, orderLineItems, subOrders } from './orders';
import { returns } from './fulfilment';
import { payouts } from './money';
import { sellers } from './sellers';

export const inventoryReservationStatus = pgEnum('inventory_reservation_status', ['active','released','consumed','expired']);
export const inventoryMovementReason = pgEnum('inventory_movement_reason', [
  'opening_balance','seller_correction','reservation','release','sale',
  'return_inspected','damage','transfer_in','transfer_out',
]);
export const inventoryLocations = pgTable('inventory_locations', {
  id: uuid('id').defaultRandom().primaryKey(), sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  code: text('code').notNull(), name: text('name').notNull(), kind: text('kind').default('seller').notNull(),
  active: boolean('active').default(true).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('inventory_locations_seller_code_key').on(t.sellerId,t.code), uniqueIndex('inventory_locations_id_seller_key').on(t.id,t.sellerId)]);
export const inventoryBalances = pgTable('inventory_balances', {
  productId: uuid('product_id').notNull(), locationId: uuid('location_id').notNull(), sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  onHand: integer('on_hand').default(0).notNull(), reserved: integer('reserved').default(0).notNull(), updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
}, (t) => [primaryKey({columns:[t.productId,t.locationId]}), foreignKey({columns:[t.productId,t.sellerId],foreignColumns:[products.id,products.sellerId]}),
  foreignKey({columns:[t.locationId,t.sellerId],foreignColumns:[inventoryLocations.id,inventoryLocations.sellerId]}),
  check('inventory_balances_nonnegative',sql`${t.onHand}>=0 AND ${t.reserved}>=0 AND ${t.reserved}<=${t.onHand}`)]);
export const inventoryReservations = pgTable('inventory_reservations', {
  id: uuid('id').defaultRandom().primaryKey(), idempotencyKey: uuid('idempotency_key').notNull(), productId: uuid('product_id').notNull(),
  locationId: uuid('location_id').notNull(), sellerId: uuid('seller_id').notNull().references(() => sellers.id,{onDelete:'restrict'}),
  orderLineItemId: uuid('order_line_item_id').references(() => orderLineItems.id,{onDelete:'restrict'}), quantity: integer('quantity').notNull(),
  status: inventoryReservationStatus('status').default('active').notNull(), expiresAt: timestamp('expires_at',{withTimezone:true}).notNull(),
  releasedAt: timestamp('released_at',{withTimezone:true}), consumedAt: timestamp('consumed_at',{withTimezone:true}), createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
}, (t) => [uniqueIndex('inventory_reservations_idempotency_key_key').on(t.idempotencyKey), index('inventory_reservations_product_idx').on(t.productId,t.status),
  foreignKey({columns:[t.productId,t.locationId],foreignColumns:[inventoryBalances.productId,inventoryBalances.locationId]}),
  foreignKey({columns:[t.productId,t.sellerId],foreignColumns:[products.id,products.sellerId]}), check('inventory_reservations_quantity_positive',sql`${t.quantity}>0`)]);
export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').defaultRandom().primaryKey(), idempotencyKey: text('idempotency_key').notNull(), sellerId: uuid('seller_id').notNull().references(() => sellers.id,{onDelete:'restrict'}),
  productId: uuid('product_id').notNull(), locationId: uuid('location_id').notNull(), reservationId: uuid('reservation_id').references(() => inventoryReservations.id,{onDelete:'restrict'}),
  reason: inventoryMovementReason('reason').notNull(), deltaOnHand: integer('delta_on_hand').default(0).notNull(), deltaReserved: integer('delta_reserved').default(0).notNull(),
  actorId: uuid('actor_id'), note: text('note'), occurredAt: timestamp('occurred_at',{withTimezone:true}).defaultNow().notNull(),
}, (t) => [uniqueIndex('inventory_movements_idempotency_key_key').on(t.idempotencyKey), index('inventory_movements_product_idx').on(t.productId,t.occurredAt),
  foreignKey({columns:[t.productId,t.locationId],foreignColumns:[inventoryBalances.productId,inventoryBalances.locationId]})]);

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').defaultRandom().primaryKey(), orderId: uuid('order_id').notNull().references(() => orders.id,{onDelete:'restrict'}), provider:text('provider').notNull(),
  idempotencyKey:uuid('idempotency_key').notNull(), providerAttemptId:text('provider_attempt_id'), amountPiastres:integer('amount_piastres').notNull(), currency:text('currency').default('EGP').notNull(),
  status:text('status').default('pending').notNull(), failureCode:text('failure_code'), createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
}, (t) => [uniqueIndex('payment_attempts_provider_idempotency_key').on(t.provider,t.idempotencyKey), uniqueIndex('payment_attempts_provider_ref_key').on(t.provider,t.providerAttemptId).where(sql`${t.providerAttemptId} IS NOT NULL`), index('payment_attempts_order_idx').on(t.orderId,t.createdAt)]);
export const refunds = pgTable('refunds', {
  id:uuid('id').defaultRandom().primaryKey(), orderId:uuid('order_id').notNull().references(() => orders.id,{onDelete:'restrict'}), returnId:uuid('return_id').references(() => returns.id,{onDelete:'restrict'}),
  provider:text('provider').notNull(), idempotencyKey:uuid('idempotency_key').notNull(), providerRef:text('provider_ref'), amountPiastres:integer('amount_piastres').notNull(), status:text('status').default('requested').notNull(),
  createdBy:uuid('created_by').notNull(), createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), completedAt:timestamp('completed_at',{withTimezone:true}),
}, (t) => [uniqueIndex('refunds_provider_idempotency_key').on(t.provider,t.idempotencyKey), uniqueIndex('refunds_provider_ref_key').on(t.provider,t.providerRef).where(sql`${t.providerRef} IS NOT NULL`)]);
export const refundAllocations = pgTable('refund_allocations', {
  refundId:uuid('refund_id').notNull().references(() => refunds.id,{onDelete:'restrict'}), lineItemId:uuid('line_item_id').notNull().references(() => orderLineItems.id,{onDelete:'restrict'}), amountPiastres:integer('amount_piastres').notNull(),
}, (t) => [primaryKey({columns:[t.refundId,t.lineItemId]}), check('refund_allocations_positive',sql`${t.amountPiastres}>0`)]);
export const financialPostings = pgTable('financial_postings', {
  id:uuid('id').defaultRandom().primaryKey(), idempotencyKey:text('idempotency_key').notNull(), sellerId:uuid('seller_id').references(() => sellers.id,{onDelete:'restrict'}),
  orderId:uuid('order_id').references(() => orders.id,{onDelete:'restrict'}), subOrderId:uuid('sub_order_id').references(() => subOrders.id,{onDelete:'restrict'}), payoutId:uuid('payout_id').references(() => payouts.id,{onDelete:'restrict'}), refundId:uuid('refund_id').references(() => refunds.id,{onDelete:'restrict'}),
  kind:text('kind').notNull(), amountPiastres:integer('amount_piastres').notNull(), currency:text('currency').default('EGP').notNull(), externalRef:text('external_ref'), occurredAt:timestamp('occurred_at',{withTimezone:true}).defaultNow().notNull(), createdBy:uuid('created_by'),
}, (t) => [uniqueIndex('financial_postings_idempotency_key_key').on(t.idempotencyKey), index('financial_postings_seller_time_idx').on(t.sellerId,t.occurredAt), index('financial_postings_order_idx').on(t.orderId)]);
