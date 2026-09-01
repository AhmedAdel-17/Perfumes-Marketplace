/**
 * Customers and addresses.
 *
 * CLAUDE.md §16: the PHONE is the primary customer identifier, not email.
 *
 * Guest checkout is the interim position on D-2, which creates an identity
 * resolution problem the founding pack does not name: a guest order placed on a
 * phone number must be able to merge into an account later, or `direct_repeat`
 * attribution and the 90-day repeat metric are both structurally wrong.
 * `customers.claimed_at` exists for exactly that.
 */
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { governorate } from './enums';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** E.164 Egyptian mobile. The identity anchor. */
  phone: text('phone').notNull(),
  fullName: text('full_name'),
  email: text('email'),
  /** Null while the record exists only from guest checkout. */
  authUserId: uuid('auth_user_id'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('customers_phone_key').on(t.phone),
  index('customers_auth_user_idx').on(t.authUserId),
]);

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  label: text('label'),
  governorate: governorate('governorate').notNull(),
  city: text('city').notNull(),
  area: text('area').notNull(),
  street: text('street').notNull(),
  building: text('building').notNull(),
  floor: text('floor'),
  apartment: text('apartment'),
  /** How Egyptian addresses actually work. Reduces failed-delivery cost. */
  landmark: text('landmark'),
  contactPhone: text('contact_phone').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('customer_addresses_customer_idx').on(t.customerId)]);
