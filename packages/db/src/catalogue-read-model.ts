/**
 * The shopfront's reads, on Drizzle.
 *
 * MOVED HERE from `apps/web/src/core/catalogue.ts` (task P3.4.1, ADR-10). The
 * queries are the same queries; what changed is the connection they run on.
 * There they used the raw handle, which is a SUPERUSER, so every policy in
 * migration 0002 was bypassed on the busiest path in the product. Here they run
 * inside the Unit of Work as `anon`, and `public_read_published_products`,
 * `public_read_live_sellers` and `public_read_media` decide what comes back.
 *
 * THAT IS WHY THE STATUS FILTERS LOOK THIN. A few remain — a suspended house
 * must 404 rather than show an empty storefront, which is a product decision
 * RLS cannot express — but the ones that were doing security work are gone.
 * Duplicating a policy in a WHERE clause is a second place to get it wrong, and
 * the second place is the one nobody updates.
 */
import { and, asc, desc, eq, gt, inArray, isNotNull, like, sql } from 'drizzle-orm';
import type {
  CatalogueHouseRow, CatalogueHouseSummary, CataloguePhotoRow,
  CatalogueProductRow, CatalogueReadModel, CatalogueSearchCriteria,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

type ProductRow = typeof schema.products.$inferSelect;

const toRow = (
  p: ProductRow,
  brandName: string,
  brandNameEn: string | null,
  houseSlug: string | null = null,
): CatalogueProductRow => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  nameEn: p.nameEn,
  pricePiastres: p.pricePiastres,
  promoPricePiastres: p.promoPricePiastres,
  volumeMl: p.volumeMl,
  stock: p.stock,
  scentFamily: p.scentFamily,
  concentration: p.concentration,
  notesTop: p.notesTop ?? [],
  notesHeart: p.notesHeart ?? [],
  notesBase: p.notesBase ?? [],
  longevityBand: p.longevityBand,
  projectionBand: p.projectionBand,
  performanceSource: p.performanceSource,
  fulfilmentHours: p.fulfilmentHours,
  brandName,
  brandNameEn,
  houseSlug,
});

/**
 * What the customer would PAY, as SQL.
 *
 * The promotional price when there is one, otherwise the list price — the same
 * expression the product card renders. Filtering or sorting on the list price
 * while showing the promotional one puts a bottle marked 400 outside an "under
 * 500" filter while the customer is looking straight at the number that says it
 * belongs there.
 */
const payable = sql`coalesce(${schema.products.promoPricePiastres}, ${schema.products.pricePiastres})`;

export const catalogueReadModel = (db: DiyarDatabase): CatalogueReadModel => ({
  async noteGlossary(notes) {
    const wanted = [...new Set(notes)];
    if (wanted.length === 0) return new Map();
    const rows = await db
      .select({ ar: schema.noteGlossary.ar, en: schema.noteGlossary.en, icon: schema.noteGlossary.icon })
      .from(schema.noteGlossary)
      .where(inArray(schema.noteGlossary.ar, wanted));
    return new Map(rows.map((row) => [row.ar, { en: row.en, icon: row.icon }]));
  },

  async publishedProducts() {
    const rows = await db
      .select({ p: schema.products, brandName: schema.brands.name, brandEn: schema.brands.nameEn })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      // `id` last, so two listings created in the same instant still come back
      // in one order rather than whichever the planner prefers that day.
      .orderBy(
        desc(sql`coalesce(${schema.products.publishedAt}, ${schema.products.createdAt})`),
        asc(schema.products.id),
      );
    return rows.map((r) => toRow(r.p, r.brandName, r.brandEn));
  },

  async productBySlug(slug) {
    const [row] = await db
      .select({
        p: schema.products,
        brandName: schema.brands.name,
        brandEn: schema.brands.nameEn,
        houseSlug: schema.sellers.slug,
      })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
      .where(eq(schema.products.slug, slug))
      .limit(1);

    return row ? toRow(row.p, row.brandName, row.brandEn, row.houseSlug) : null;
  },

  async houseBySlug(slug) {
    const [house] = await db
      .select({ s: schema.sellers })
      .from(schema.sellers)
      .where(eq(schema.sellers.slug, slug))
      .limit(1);

    /*
     * `live` only, checked HERE and not left to RLS.
     *
     * The policy already hides a house that has merely applied. What it cannot
     * express is the product decision: a SUSPENDED house must 404 rather than
     * present an empty storefront, because an empty shopfront reads as a bug
     * and a 404 reads as an answer.
     */
    if (!house || house.s.status !== 'live') return null;

    const [brand] = await db
      .select({ name: schema.brands.name, nameEn: schema.brands.nameEn })
      .from(schema.brands)
      .where(eq(schema.brands.sellerId, house.s.id))
      .limit(1);

    return {
      id: house.s.id,
      slug: house.s.slug,
      tradingName: house.s.tradingName,
      bio: house.s.bio,
      story: house.s.story,
      bioEn: house.s.bioEn,
      storyEn: house.s.storyEn,
      foundedYear: house.s.foundedYear,
      city: house.s.city,
      serviceGovernorates: house.s.serviceGovernorates ?? [],
      brandName: brand?.name ?? null,
      brandNameEn: brand?.nameEn ?? null,
    };
  },

  async publishedProductsForHouse(sellerId) {
    const rows = await db
      .select({ p: schema.products, brandName: schema.brands.name, brandEn: schema.brands.nameEn })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(eq(schema.products.sellerId, sellerId));
    return rows.map((r) => toRow(r.p, r.brandName, r.brandEn));
  },

  async houses() {
    const rows = await db
      .select({
        slug: schema.sellers.slug,
        name: schema.sellers.tradingName,
        city: schema.sellers.city,
        foundedYear: schema.sellers.foundedYear,
        brandName: schema.brands.name,
        brandEn: schema.brands.nameEn,
        productId: schema.products.id,
      })
      .from(schema.sellers)
      .innerJoin(schema.products, eq(schema.products.sellerId, schema.sellers.id))
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(eq(schema.sellers.status, 'live'));

    // Grouped here rather than in SQL: the join is small, and a GROUP BY with a
    // brand name in it would need an aggregate that picks an arbitrary brand.
    const byHouse = new Map<string, CatalogueHouseSummary & { publishedCount: number }>();
    for (const row of rows) {
      const existing = byHouse.get(row.slug);
      if (existing) { existing.publishedCount += 1; continue; }
      byHouse.set(row.slug, {
        slug: row.slug,
        name: row.name,
        brandName: row.brandName,
        brandNameEn: row.brandEn,
        city: row.city,
        foundedYear: row.foundedYear,
        publishedCount: 1,
      });
    }

    return [...byHouse.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  },

  async search(criteria) {
    const conditions = [];

    for (const term of criteria.terms) {
      // AND across terms: two words is a customer narrowing down, and matching
      // either would return the whole amber section and bury what they asked for.
      conditions.push(like(schema.products.searchText, `%${term}%`));
    }

    if (criteria.families.length > 0) {
      conditions.push(inArray(schema.products.scentFamily, [...criteria.families] as never));
    }
    if (criteria.inStockOnly) conditions.push(gt(schema.products.stock, 0));
    if (criteria.minEgp !== null) conditions.push(sql`${payable} >= ${criteria.minEgp * 100}`);
    if (criteria.maxEgp !== null) conditions.push(sql`${payable} <= ${criteria.maxEgp * 100}`);
    if (criteria.houses.length > 0) {
      conditions.push(inArray(schema.sellers.slug, [...criteria.houses]));
    }

    const order = criteria.sort === 'price_asc' ? asc(payable)
      : criteria.sort === 'price_desc' ? desc(payable)
        : desc(schema.products.createdAt);

    const rows = await db
      .select({ p: schema.products, brandName: schema.brands.name, brandEn: schema.brands.nameEn })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(order);

    return rows.map((r) => toRow(r.p, r.brandName, r.brandEn));
  },

  async houseFilterOptions() {
    return db
      .selectDistinct({
        slug: schema.sellers.slug,
        name: schema.sellers.tradingName,
        // The house's Latin name, for the English filter panel.
        nameEn: schema.brands.nameEn,
      })
      .from(schema.sellers)
      .innerJoin(schema.products, eq(schema.products.sellerId, schema.sellers.id))
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(eq(schema.sellers.status, 'live'))
      .orderBy(asc(schema.sellers.tradingName));
  },

  async primaryPhotos(productIds) {
    if (productIds.length === 0) return [];

    const rows = await db
      .select({
        productId: schema.productMedia.productId,
        storageKey: schema.productMedia.storagePath,
        alt: schema.productMedia.altText,
        width: schema.productMedia.width,
        height: schema.productMedia.height,
      })
      .from(schema.productMedia)
      .where(and(
        inArray(schema.productMedia.productId, [...productIds]),
        eq(schema.productMedia.isPrimary, true),
        /*
         * VERIFIED rows only, and this one is not a duplicated policy.
         *
         * Rows written before the upload flow existed name a path with no file
         * behind it and carry no facts (migration 0021). Turning one into a URL
         * puts a broken image on a live product, so the absence of a
         * `content_type` is the record saying "do not render me".
         */
        isNotNull(schema.productMedia.contentType),
      ));

    return rows
      .filter((r): r is typeof r & { width: number; height: number } =>
        r.width !== null && r.height !== null)
      .map((r): CataloguePhotoRow => ({
        productId: r.productId,
        storageKey: r.storageKey,
        alt: r.alt,
        width: r.width,
        height: r.height,
      }));
  },
});
