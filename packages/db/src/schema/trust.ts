/**
 * Reviews.
 *
 * Acceptance gate 5: only a DELIVERED sub-order can produce a verified-purchase
 * review — enforced by a database trigger, not application logic.
 *
 * Doc 04 §3 and doc 06 §10: sellers have no deletion rights. There is no
 * seller-writable path to this table; moderation is a platform action and every
 * moderation action is logged.
 */
import { boolean, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { subOrders, orderLineItems } from './orders';
import { customers } from './identity';
import { products } from './catalogue';

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  subOrderId: uuid('sub_order_id').notNull().references(() => subOrders.id, { onDelete: 'restrict' }),
  lineItemId: uuid('line_item_id').notNull().references(() => orderLineItems.id, { onDelete: 'restrict' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),

  /* six structured dimensions, 1-5 */
  ratingScent: integer('rating_scent').notNull(),
  ratingLongevity: integer('rating_longevity').notNull(),
  ratingProjection: integer('rating_projection').notNull(),
  ratingValue: integer('rating_value').notNull(),
  ratingPackaging: integer('rating_packaging').notNull(),
  /** The dimension that polices sellers. */
  ratingDescriptionAccuracy: integer('rating_description_accuracy').notNull(),

  body: text('body'),
  /**
   * The byline, masked and SNAPSHOTTED at write time (migration 0016).
   *
   * Never the full name. Reading a review joins nothing, which is what lets an
   * anonymous visitor read one at all — `customers` has no public policy, and
   * must not have one.
   */
  authorLabel: text('author_label').notNull(),
  /** Doc 06 §10: reviews disclose incentives, samples or promotional consideration. */
  incentiveDisclosed: boolean('incentive_disclosed').default(false).notNull(),

  moderatedBy: uuid('moderated_by'),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  moderationNote: text('moderation_note'),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('reviews_line_item_key').on(t.lineItemId),
  index('reviews_product_idx').on(t.productId),
  foreignKey({ name: 'reviews_line_identity_fk', columns: [t.lineItemId, t.subOrderId, t.productId],
    foreignColumns: [orderLineItems.id, orderLineItems.subOrderId, orderLineItems.productId] }),
]);
