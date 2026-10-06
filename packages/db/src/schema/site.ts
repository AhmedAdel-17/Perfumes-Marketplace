/**
 * Site-level content: announcements, and what opens the homepage.
 *
 * Migration 0013 carries the reasoning, including why an announcement is the
 * one piece of content here that is not reviewed before it goes up.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { platformStaff } from './governance';
import { products } from './catalogue';

export const announcements = pgTable('announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  message: text('message').notNull(),
  /** The same notice in English (0030). Optional; bounded like the Arabic. */
  messageEn: text('message_en'),
  /** Internal paths only — the database CHECKs it, because this appears on
   *  every page and an outbound link here is the whole site's problem. */
  href: text('href'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => platformStaff.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('announcements_window_idx').on(t.startsAt, t.endsAt),
]);

export const siteCuration = pgTable('site_curation', {
  /** One row, forever. The CHECK and the primary key together make a second
   *  row a constraint violation rather than a second opinion. */
  singleton: boolean('singleton').default(true).primaryKey(),
  heroProductId: uuid('hero_product_id').references(() => products.id, { onDelete: 'set null' }),
  /** Ordered — the running order IS the curation decision. */
  featuredProductIds: uuid('featured_product_ids').array().notNull()
    .default(sql`'{}'::uuid[]`),
  updatedBy: uuid('updated_by').references(() => platformStaff.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Scent notes in English, one entry per note as houses write it in Arabic.
 * Migration 0030 carries the reasoning: a note is vocabulary, kept once by the
 * platform, not translated per product by every house.
 */
export const noteGlossary = pgTable('note_glossary', {
  ar: text('ar').primaryKey(),
  en: text('en').notNull(),
  updatedBy: uuid('updated_by').references(() => platformStaff.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
