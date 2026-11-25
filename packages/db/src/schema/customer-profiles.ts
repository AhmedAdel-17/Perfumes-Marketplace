import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './identity';
/** One profile per customer; legacy rows are never assigned invented demographics. */
export const customerProfiles = pgTable('customer_profiles', {
    customerId: uuid('customer_id').primaryKey().references(() => customers.id, { onDelete: 'cascade' }),
    dateOfBirth: date('date_of_birth').notNull(), gender: text('gender').notNull(),
    families: text('families').array().notNull().default([]), notes: text('notes').array().notNull().default([]),
    occasions: text('occasions').array().notNull().default([]), seasons: text('seasons').array().notNull().default([]),
    concentrations: text('concentrations').array().notNull().default([]), bottleSizes: integer('bottle_sizes').array().notNull().default([]),
    budgetMinPiastres: integer('budget_min_piastres'), budgetMaxPiastres: integer('budget_max_piastres'),
    personalizationConsent: boolean('personalization_consent').notNull().default(false), marketingConsent: boolean('marketing_consent').notNull().default(false),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').notNull().default('customer_account'),
});
export const customerProfileHistory = pgTable('customer_profile_history', {
    id: uuid('id').primaryKey().defaultRandom(), customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').notNull(), recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});
