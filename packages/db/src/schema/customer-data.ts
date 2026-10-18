/**
 * Customer data collected for future analysis and personalization.
 *
 * Profiles and preferences describe the customer. Behaviour events describe
 * observations. Orders remain the source of truth for commerce and money.
 */
import { sql } from 'drizzle-orm';
import {
  date, foreignKey, index, integer, pgTable, primaryKey, text,
  timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { brands, products } from './catalogue';
import { customers } from './identity';
import { orders } from './orders';
import { sellers } from './sellers';
import { noteGlossary } from './site';
import {
  concentration, customerDataSource, customerEventChannel, customerEventName,
  customerGender, dayNight, occasion, scentFamily, season,
} from './enums';

/** One completed profile per customer. Age is calculated from birthDate. */
export const customerProfiles = pgTable('customer_profiles', {
  customerId: uuid('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  gender: customerGender('gender').notNull(),
  dataSource: customerDataSource('data_source').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
}, (t) => [
  index('customer_profiles_gender_idx').on(t.gender),
  index('customer_profiles_birth_date_idx').on(t.birthDate),
  index('customer_profiles_retention_idx').on(t.retentionUntil),
]);

/** Structured, optional preference dimensions; empty arrays mean no answer. */
export const customerFragrancePreferences = pgTable('customer_fragrance_preferences', {
  customerId: uuid('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
  fragranceFamilies: scentFamily('fragrance_families').array().default(sql`'{}'::scent_family[]`).notNull(),
  occasions: occasion('occasions').array().default(sql`'{}'::occasion[]`).notNull(),
  seasons: season('seasons').array().default(sql`'{}'::season[]`).notNull(),
  concentrations: concentration('concentrations').array().default(sql`'{}'::concentration[]`).notNull(),
  dayNight: dayNight('day_night').array().default(sql`'{}'::day_night[]`).notNull(),
  budgetMinPiastres: integer('budget_min_piastres'),
  budgetMaxPiastres: integer('budget_max_piastres'),
  preferredBottleSizesMl: integer('preferred_bottle_sizes_ml').array().default(sql`'{}'::integer[]`).notNull(),
  dataSource: customerDataSource('data_source').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
});

/** Normalized note preferences reference the platform vocabulary. */
export const customerPreferredNotes = pgTable('customer_preferred_notes', {
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  noteAr: text('note_ar').notNull().references(() => noteGlossary.ar, { onDelete: 'restrict' }),
  dataSource: customerDataSource('data_source').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: 'customer_preferred_notes_pk', columns: [t.customerId, t.noteAr] }),
  index('customer_preferred_notes_note_idx').on(t.noteAr),
]);

/** Browser/app session that can be linked once after the customer signs in. */
export const customerDataSessions = pgTable('customer_data_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  anonymousId: text('anonymous_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  channel: customerEventChannel('channel').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  linkedAt: timestamp('linked_at', { withTimezone: true }),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
}, (t) => [
  uniqueIndex('customer_data_sessions_anonymous_key').on(t.anonymousId),
  index('customer_data_sessions_customer_idx').on(t.customerId, t.startedAt),
  index('customer_data_sessions_retention_idx').on(t.retentionUntil),
]);

/** Append-only observations. ClientEventId makes retried writes idempotent. */
export const customerBehaviorEvents = pgTable('customer_behavior_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientEventId: uuid('client_event_id').notNull(),
  name: customerEventName('name').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  sessionId: uuid('session_id').notNull().references(() => customerDataSessions.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'set null' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  /** A product is the current sellable SKU/variant in DIYAR's implemented catalogue. */
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  channel: customerEventChannel('channel').notNull(),
  retentionUntil: timestamp('retention_until', { withTimezone: true })
    .default(sql`now() + interval '730 days'`).notNull(),
}, (t) => [
  uniqueIndex('customer_behavior_events_client_key').on(t.clientEventId),
  foreignKey({
    name: 'customer_behavior_events_brand_seller_fk',
    columns: [t.brandId, t.sellerId],
    foreignColumns: [brands.id, brands.sellerId],
  }),
  foreignKey({
    name: 'customer_behavior_events_product_seller_fk',
    columns: [t.productId, t.sellerId],
    foreignColumns: [products.id, products.sellerId],
  }),
  index('customer_behavior_events_customer_time_idx').on(t.customerId, t.occurredAt),
  index('customer_behavior_events_session_time_idx').on(t.sessionId, t.occurredAt),
  index('customer_behavior_events_seller_time_idx').on(t.sellerId, t.occurredAt),
  index('customer_behavior_events_product_time_idx').on(t.productId, t.occurredAt),
  index('customer_behavior_events_name_time_idx').on(t.name, t.occurredAt),
  index('customer_behavior_events_retention_idx').on(t.retentionUntil),
]);

/** Metadata-only history: tracks changes without retaining old personal values. */
export const customerDataChanges = pgTable('customer_data_changes', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  entity: text('entity').notNull(),
  action: text('action').notNull(),
  changedFields: text('changed_fields').array().notNull(),
  source: customerDataSource('source').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('customer_data_changes_customer_time_idx').on(t.customerId, t.occurredAt)]);
