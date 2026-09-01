/**
 * Brands, products, media and revisions.
 *
 * Two decisions worth knowing about:
 *
 * 1. A product row is a LISTING, scoped to one seller. Two houses selling the
 *    same fragrance produce two rows (founder decision, 1 Sep 2026). The unused
 *    `masterProductId` reserves the option to group them later without a
 *    migration that rewrites orders.
 *
 * 2. Publishing is gated in the database, not only in the UI — see
 *    migrations/0001_constraints.sql. "No listing publishes with missing
 *    required fields" is a constraint, not a convention.
 */
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sellers } from './sellers';
import {
  concentration, dayNight, genderPositioning, longevityBand, occasion,
  performanceSource, productForm, productStatus, projectionBand,
  returnEligibility, scentFamily, season,
} from './enums';

export const brands = pgTable('brands', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  nameEn: text('name_en'),
  slug: text('slug').notNull(),
  story: text('story'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('brands_slug_key').on(t.slug)]);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),

  /* identity */
  sellerId: uuid('seller_id').notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'restrict' }),
  /** Reserved. Null today; lets listings be grouped into one product later. */
  masterProductId: uuid('master_product_id'),
  name: text('name').notNull(),
  nameEn: text('name_en'),
  slug: text('slug').notNull(),
  sku: text('sku').notNull(),
  status: productStatus('status').default('draft').notNull(),

  /* commerce — money in integer piastres, matching the Money value object */
  pricePiastres: integer('price_piastres').notNull(),
  promoPricePiastres: integer('promo_price_piastres'),
  volumeMl: integer('volume_ml').notNull(),
  stock: integer('stock').default(0).notNull(),
  fulfilmentHours: integer('fulfilment_hours').default(48).notNull(),

  /* product */
  concentration: concentration('concentration'),
  form: productForm('form'),
  genderPositioning: genderPositioning('gender_positioning'),
  scentFamily: scentFamily('scent_family'),
  notesTop: text('notes_top').array(),
  notesHeart: text('notes_heart').array(),
  notesBase: text('notes_base').array(),

  /* use */
  seasons: season('seasons').array(),
  dayNight: dayNight('day_night'),
  occasions: occasion('occasions').array(),
  projectionBand: projectionBand('projection_band'),
  longevityBand: longevityBand('longevity_band'),
  /** Never present a seller claim as platform fact. */
  performanceSource: performanceSource('performance_source'),

  /* compliance */
  responsiblePartyName: text('responsible_party_name'),
  warningsLabelData: text('warnings_label_data'),
  evidenceRefs: text('evidence_refs').array(),

  /* policy */
  returnEligibility: returnEligibility('return_eligibility'),
  defectRoute: text('defect_route'),

  /* moderation */
  moderationNotes: text('moderation_notes'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('products_slug_key').on(t.slug),
  uniqueIndex('products_seller_sku_key').on(t.sellerId, t.sku),
  index('products_status_idx').on(t.status),
  index('products_family_idx').on(t.scentFamily),
  index('products_brand_idx').on(t.brandId),
]);

export const productMedia = pgTable('product_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  altText: text('alt_text').notNull(),
  position: integer('position').default(0).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  /** Required catalogue field: the seller confirms it owns the image. */
  ownershipConfirmed: boolean('ownership_confirmed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('product_media_product_idx').on(t.productId)]);

/** Append-only. Doc 06 §4: material changes create an auditable revision. */
export const productRevisions = pgTable('product_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  changedBy: uuid('changed_by'),
  changedFields: text('changed_fields').array().notNull(),
  before: text('before').notNull(),
  after: text('after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('product_revisions_product_idx').on(t.productId)]);
