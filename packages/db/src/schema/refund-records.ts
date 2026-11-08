import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { returns } from './fulfilment';
import { orderLineItems, subOrders } from './orders';
import { sellers } from './sellers';

/** Immutable facts of recorded refund decisions; never proof of provider execution. */
export const returnRefundRecords = pgTable('return_refund_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  returnId: uuid('return_id').notNull().references(() => returns.id, { onDelete: 'restrict' }),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  lineItemId: uuid('line_item_id').references(() => orderLineItems.id, { onDelete: 'restrict' }),
  amountPiastres: integer('amount_piastres').notNull(),
  source: text('source').notNull(),
  recordedBy: uuid('recorded_by'),
  observedDecisionAt: timestamp('observed_decision_at', { withTimezone: true }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('return_refund_records_return_id_key').on(table.returnId),
  index('return_refund_records_sub_order_idx').on(table.subOrderId),
  index('return_refund_records_seller_idx').on(table.sellerId, table.recordedAt),
  check('return_refund_records_amount_piastres_check', sql`${table.amountPiastres} >= 0`),
  check('return_refund_records_source_check', sql`${table.source} IN ('historical_import', 'recorded')`),
]);
