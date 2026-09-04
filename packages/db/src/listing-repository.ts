/**
 * Listings, on Drizzle.
 *
 * The adapter for `ListingRepository`. Reads and writes go through the same
 * Unit of Work as everything else, so RLS and the status guard from 0010 both
 * apply — this file is not a way around either.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type {
  ListingDraft, ListingRecord, ListingRepository, ListingState,
  ModerationReason, QueuedListing,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

type Row = typeof schema.products.$inferSelect;

const toRecord = (row: Row): ListingRecord => ({
  id: row.id,
  sellerId: row.sellerId,
  state: row.status as ListingState,
  name: row.name,
  slug: row.slug,
  sku: row.sku,
  brandId: row.brandId,
  pricePiastres: row.pricePiastres,
  promoPricePiastres: row.promoPricePiastres,
  volumeMl: row.volumeMl,
  stock: row.stock,
  fulfilmentHours: row.fulfilmentHours,
  concentration: row.concentration,
  form: row.form,
  genderPositioning: row.genderPositioning,
  scentFamily: row.scentFamily,
  notesTop: row.notesTop,
  notesHeart: row.notesHeart,
  notesBase: row.notesBase,
  seasons: row.seasons,
  dayNight: row.dayNight,
  occasions: row.occasions,
  projectionBand: row.projectionBand,
  longevityBand: row.longevityBand,
  performanceSource: row.performanceSource,
  responsiblePartyName: row.responsiblePartyName,
  returnEligibility: row.returnEligibility,
  defectRoute: row.defectRoute,
  moderationReason: row.moderationReason as ModerationReason | null,
  submittedAt: row.submittedAt,
  moderatedAt: row.moderatedAt,
  updatedAt: row.updatedAt,
});

/**
 * Only the columns a house may write. State is not one of them.
 *
 * `undefined` means "not sent" and is skipped. For the NULLABLE columns `null`
 * means "cleared" and is written. For the NOT NULL ones — name, sku, price,
 * volume, stock, hours — null is skipped too: the first version coerced it to
 * an empty string or a zero, so a caller sending a field it had not loaded
 * would silently blank a listing's name. `sent()` makes that one decision in
 * one place instead of twenty-three times.
 */
const sent = (value: unknown): boolean => value !== undefined && value !== null;

const writableColumns = (input: ListingDraft) => ({
  ...(sent(input.name) ? { name: input.name! } : {}),
  ...(sent(input.sku) ? { sku: input.sku! } : {}),
  ...(sent(input.pricePiastres) ? { pricePiastres: input.pricePiastres! } : {}),
  ...(input.promoPricePiastres !== undefined
    ? { promoPricePiastres: input.promoPricePiastres } : {}),
  ...(sent(input.volumeMl) ? { volumeMl: input.volumeMl! } : {}),
  ...(sent(input.stock) ? { stock: input.stock! } : {}),
  ...(sent(input.fulfilmentHours) ? { fulfilmentHours: input.fulfilmentHours! } : {}),
  ...(input.concentration !== undefined ? { concentration: input.concentration } : {}),
  ...(input.form !== undefined ? { form: input.form } : {}),
  ...(input.genderPositioning !== undefined
    ? { genderPositioning: input.genderPositioning } : {}),
  ...(input.scentFamily !== undefined ? { scentFamily: input.scentFamily } : {}),
  ...(input.notesTop !== undefined ? { notesTop: input.notesTop } : {}),
  ...(input.notesHeart !== undefined ? { notesHeart: input.notesHeart } : {}),
  ...(input.notesBase !== undefined ? { notesBase: input.notesBase } : {}),
  ...(input.seasons !== undefined ? { seasons: input.seasons } : {}),
  ...(input.dayNight !== undefined ? { dayNight: input.dayNight } : {}),
  ...(input.occasions !== undefined ? { occasions: input.occasions } : {}),
  ...(input.projectionBand !== undefined ? { projectionBand: input.projectionBand } : {}),
  ...(input.longevityBand !== undefined ? { longevityBand: input.longevityBand } : {}),
  ...(input.performanceSource !== undefined
    ? { performanceSource: input.performanceSource } : {}),
  ...(input.responsiblePartyName !== undefined
    ? { responsiblePartyName: input.responsiblePartyName } : {}),
  ...(input.returnEligibility !== undefined
    ? { returnEligibility: input.returnEligibility } : {}),
  ...(input.defectRoute !== undefined ? { defectRoute: input.defectRoute } : {}),
  updatedAt: new Date(),
}) as Partial<typeof schema.products.$inferInsert>;

export const listingRepository = (db: DiyarDatabase): ListingRepository => ({
  async listForSeller(sellerId) {
    const rows = await db.select().from(schema.products)
      .where(eq(schema.products.sellerId, sellerId))
      .orderBy(desc(schema.products.updatedAt));
    return rows.map(toRecord);
  },

  async findForSeller(id, sellerId) {
    // Both halves in the WHERE clause. Matching the seller afterwards in
    // TypeScript is the shape that disclosed every order to anyone holding a
    // reference — see `findForCustomerLookup`.
    const [row] = await db.select().from(schema.products)
      .where(and(eq(schema.products.id, id), eq(schema.products.sellerId, sellerId)))
      .limit(1);
    return row ? toRecord(row) : null;
  },

  async findAnywhere(id) {
    const [row] = await db.select().from(schema.products)
      .where(eq(schema.products.id, id)).limit(1);
    return row ? toRecord(row) : null;
  },

  async create(sellerId, input) {
    const [row] = await db.insert(schema.products).values({
      sellerId,
      brandId: input.brandId,
      name: input.name,
      slug: input.slug,
      sku: input.sku,
      // A new listing has no price yet and the column is NOT NULL. Zero is the
      // honest placeholder and the completeness check refuses to submit it,
      // which is the difference between a database default and a business rule.
      pricePiastres: 0,
      volumeMl: 0,
      status: 'draft',
    }).returning();
    return toRecord(row!);
  },

  async update(id, sellerId, input) {
    await db.update(schema.products)
      .set(writableColumns(input))
      .where(and(eq(schema.products.id, id), eq(schema.products.sellerId, sellerId)));
  },

  async move(id, to, input) {
    await db.update(schema.products).set({
      status: to,
      updatedAt: input.at,
      // Cleared on the way out of moderation, not left behind: a listing that
      // was sent back, fixed and published must not still show the reason it
      // was once refused.
      moderationReason: input.reason ?? null,
      ...(to === 'pending_moderation' ? { submittedAt: input.at } : {}),
      ...(input.moderatedBy
        ? { moderatedBy: input.moderatedBy, moderatedAt: input.at }
        : {}),
      ...(to === 'published' ? { publishedAt: input.at } : {}),
    }).where(eq(schema.products.id, id));
  },

  async hasPrimaryImage(id) {
    const [row] = await db.select({ n: sql<number>`count(*)::int` })
      .from(schema.productMedia)
      .where(and(
        eq(schema.productMedia.productId, id),
        eq(schema.productMedia.isPrimary, true),
        eq(schema.productMedia.ownershipConfirmed, true),
        sql`btrim(${schema.productMedia.altText}) <> ''`,
      ));
    return (row?.n ?? 0) > 0;
  },

  async moderationQueue() {
    const rows = await db
      .select({
        id: schema.products.id,
        sellerId: schema.products.sellerId,
        brandName: schema.brands.name,
        name: schema.products.name,
        slug: schema.products.slug,
        pricePiastres: schema.products.pricePiastres,
        volumeMl: schema.products.volumeMl,
        submittedAt: schema.products.submittedAt,
        notesTop: schema.products.notesTop,
        notesHeart: schema.products.notesHeart,
        notesBase: schema.products.notesBase,
        defectRoute: schema.products.defectRoute,
        responsiblePartyName: schema.products.responsiblePartyName,
      })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(eq(schema.products.status, 'pending_moderation'))
      // Oldest first. A queue ordered any other way is a queue where the
      // forgotten item stays forgotten.
      .orderBy(asc(schema.products.submittedAt));

    return rows.map((row): QueuedListing => ({
      id: row.id,
      sellerId: row.sellerId,
      brandName: row.brandName,
      name: row.name,
      slug: row.slug,
      pricePiastres: row.pricePiastres,
      volumeMl: row.volumeMl,
      submittedAt: row.submittedAt,
      // Everything free-text a house wrote, so the claims inspector sees the
      // same words a moderator will read.
      claimText: [
        row.name,
        ...(row.notesTop ?? []),
        ...(row.notesHeart ?? []),
        ...(row.notesBase ?? []),
        row.defectRoute ?? '',
        row.responsiblePartyName ?? '',
      ].filter(Boolean),
    }));
  },
});
