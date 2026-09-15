import 'server-only';
import { unitOfWork } from './db';
import { and, asc, desc, eq, gt, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { schema } from '@diyar/db';
import { queryTerms, type CatalogueQuery } from '@diyar/domain';
import { database } from './db';
import { mediaStore } from './media';

/**
 * Read models for the public catalogue.
 *
 * These are the only place a database row becomes something a component renders.
 * Components receive plain data — never a Drizzle row, never a Money object —
 * so a change of storage cannot ripple into the design layer.
 */


const FAMILY_AR: Record<string, string> = {
  oud: 'عود', amber: 'عنبر', woody: 'خشبي', floral: 'زهري',
  fresh: 'منعش', gourmand: 'حلواني', musk: 'مسك',
};

const CONCENTRATION_AR: Record<string, string> = {
  parfum: 'بارفان', eau_de_parfum: 'أو دو بارفان', eau_de_toilette: 'أو دو تواليت',
  eau_de_cologne: 'أو دو كولون', oil: 'زيت', attar: 'عطر مركّز', body_mist: 'بخاخ للجسم',
};

const BAND_AR: Record<string, string> = {
  weak: 'خفيف', moderate: 'متوسّط', long: 'طويل', very_long: 'طويل جدًا',
  intimate: 'قريب', strong: 'قوي', enormous: 'واسع',
};

const BAND_EN: Record<string, string> = {
  weak: 'WEAK', moderate: 'MODERATE', long: 'LONG', very_long: 'VERY LONG',
  intimate: 'INTIMATE', strong: 'STRONG', enormous: 'ENORMOUS',
};

const BAND_FILL: Record<string, number> = {
  weak: 25, moderate: 52, long: 74, very_long: 92,
  intimate: 28, strong: 76, enormous: 95,
};

/** Doc 06 §4 — a performance band must disclose where the claim came from. */
const SOURCE_AR: Record<string, string> = {
  seller_provided: 'المصدر: بيانات الدار',
  platform_test: 'المصدر: اختبار المنصّة',
  review_aggregate: 'المصدر: متوسّط تقييمات المشترين',
};

/** A product photograph as a storefront component renders it. */
export interface StorefrontPhoto {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface ProductCard {
  id: string; slug: string; name: string; brandLatin: string;
  pricePiastres: number; volumeMl: number; familyLabel: string;
  /** Raw scent-family token key — drives the flacon render. */
  family: string;
  /**
   * The primary photograph, when the house has uploaded a VERIFIED one.
   *
   * Null otherwise, and the storefront draws the illustrated flacon instead.
   * Rows written before the upload flow existed name paths with no file behind
   * them; they carry no facts (0021) and are never turned into a URL, so the
   * shop cannot render a broken image from one.
   */
  photo: StorefrontPhoto | null;
}

export interface ProductDetail extends ProductCard {
  brandName: string;
  houseSlug: string;
  concentrationLabel: string;
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  longevity: { ar: string; en: string; fill: number; source: string } | null;
  projection: { ar: string; en: string; fill: number; source: string } | null;
  fulfilmentHours: number;
  inStock: boolean;
}

const toCard = (
  row: typeof schema.products.$inferSelect,
  brandLatin: string,
  photos: ReadonlyMap<string, StorefrontPhoto>,
): ProductCard => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  brandLatin,
  pricePiastres: row.promoPricePiastres ?? row.pricePiastres,
  volumeMl: row.volumeMl,
  familyLabel: FAMILY_AR[row.scentFamily ?? ''] ?? '',
  family: row.scentFamily ?? 'amber',
  photo: photos.get(row.id) ?? null,
});

/**
 * The verified primary photograph of each product, in ONE query.
 *
 * Asked once per page for every product on it, rather than once per product:
 * a grid of twenty-four is otherwise twenty-four round trips before the first
 * byte, and that cost lands on exactly the connections the site is built for.
 */
async function primaryPhotos(productIds: readonly string[]): Promise<Map<string, StorefrontPhoto>> {
  const found = new Map<string, StorefrontPhoto>();
  if (productIds.length === 0) return found;

  const rows = await database()
    .select({
      productId: schema.productMedia.productId,
      key: schema.productMedia.storagePath,
      alt: schema.productMedia.altText,
      width: schema.productMedia.width,
      height: schema.productMedia.height,
    })
    .from(schema.productMedia)
    .where(and(
      inArray(schema.productMedia.productId, [...productIds]),
      eq(schema.productMedia.isPrimary, true),
      // Verified rows only — see `ProductCard.photo`.
      isNotNull(schema.productMedia.contentType),
    ));

  const store = mediaStore();
  for (const row of rows) {
    found.set(row.productId, {
      url: store.publicUrl(row.key),
      alt: row.alt,
      width: row.width!,
      height: row.height!,
    });
  }
  return found;
}

export async function listPublishedProducts(): Promise<ProductCard[]> {
  const db = database();
  const rows = await db
    .select({ p: schema.products, brandEn: schema.brands.nameEn, brandName: schema.brands.name })
    .from(schema.products)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(eq(schema.products.status, 'published'));

  const photos = await primaryPhotos(rows.map((r) => r.p.id));
  return rows.map((r) => toCard(r.p, (r.brandEn ?? r.brandName).toUpperCase(), photos));
}

export async function findProductBySlug(slug: string): Promise<ProductDetail | null> {
  const db = database();
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

  if (!row || row.p.status !== 'published') return null;

  const band = (value: string | null) =>
    value
      ? {
          ar: BAND_AR[value] ?? value,
          en: BAND_EN[value] ?? value.toUpperCase(),
          fill: BAND_FILL[value] ?? 50,
          source: SOURCE_AR[row.p.performanceSource ?? 'seller_provided']!,
        }
      : null;

  const photos = await primaryPhotos([row.p.id]);

  return {
    ...toCard(row.p, (row.brandEn ?? row.brandName).toUpperCase(), photos),
    brandName: row.brandName,
    houseSlug: row.houseSlug,
    concentrationLabel: CONCENTRATION_AR[row.p.concentration ?? ''] ?? '',
    notesTop: row.p.notesTop ?? [],
    notesHeart: row.p.notesHeart ?? [],
    notesBase: row.p.notesBase ?? [],
    longevity: band(row.p.longevityBand),
    projection: band(row.p.projectionBand),
    fulfilmentHours: row.p.fulfilmentHours,
    inStock: row.p.stock > 0,
  };
}

/**
 * A house, and everything it sells.
 *
 * The marketplace's whole proposition is that these are named, independent
 * Egyptian houses rather than anonymous stock — and until this existed, a
 * customer could read a house's NAME and nothing else. `bio`, `story`,
 * `founded_year`, `city` and `service_governorates` have been on the sellers
 * table since the first migration, unread by anybody.
 */
export interface HouseDetail {
  slug: string;
  /** The trading name, in Arabic. */
  name: string;
  /** Latin, for the wordmark line. Falls back to the brand's Arabic name. */
  latin: string;
  bio: string | null;
  story: string | null;
  foundedYear: number | null;
  city: string | null;
  /** Where it delivers. Empty means it has not said, not that it delivers nowhere. */
  serviceGovernorates: string[];
  products: ProductCard[];
}

export async function findHouseBySlug(slug: string): Promise<HouseDetail | null> {
  const db = database();

  const [house] = await db
    .select({ s: schema.sellers })
    .from(schema.sellers)
    .where(eq(schema.sellers.slug, slug))
    .limit(1);

  /*
   * `live` only.
   *
   * A house that has applied, or been suspended, has no shopfront — the same
   * rule the catalogue read already applies to its listings. Returning null
   * rather than an empty page means a suspended house 404s instead of
   * presenting an empty, confusing storefront that looks like a bug.
   */
  if (!house || house.s.status !== 'live') return null;

  const rows = await db
    .select({ p: schema.products, brandEn: schema.brands.nameEn, brandName: schema.brands.name })
    .from(schema.products)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(and(
      eq(schema.products.sellerId, house.s.id),
      eq(schema.products.status, 'published'),
    ));

  const [brand] = await db
    .select({ name: schema.brands.name, nameEn: schema.brands.nameEn })
    .from(schema.brands)
    .where(eq(schema.brands.sellerId, house.s.id))
    .limit(1);

  const photos = await primaryPhotos(rows.map((r) => r.p.id));

  return {
    slug: house.s.slug,
    name: house.s.tradingName,
    latin: (brand?.nameEn ?? brand?.name ?? house.s.tradingName).toUpperCase(),
    bio: house.s.bio,
    story: house.s.story,
    foundedYear: house.s.foundedYear,
    city: house.s.city,
    serviceGovernorates: house.s.serviceGovernorates ?? [],
    products: rows.map((r) => toCard(r.p, (r.brandEn ?? r.brandName).toUpperCase(), photos)),
  };
}

/** Every live house that has something to sell — for the directory. */
export async function listHouses(): Promise<Array<{ slug: string; name: string; latin: string; city: string | null; count: number }>> {
  const db = database();
  const rows = await db
    .select({
      slug: schema.sellers.slug,
      name: schema.sellers.tradingName,
      city: schema.sellers.city,
      brandName: schema.brands.name,
      brandEn: schema.brands.nameEn,
      productId: schema.products.id,
    })
    .from(schema.sellers)
    .innerJoin(schema.products, eq(schema.products.sellerId, schema.sellers.id))
    .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(and(
      eq(schema.sellers.status, 'live'),
      eq(schema.products.status, 'published'),
    ));

  // Grouped here rather than in SQL: the join is small, and a GROUP BY with a
  // brand name in it would need an aggregate that picks an arbitrary brand.
  const byHouse = new Map<string, { slug: string; name: string; latin: string; city: string | null; count: number }>();
  for (const row of rows) {
    const existing = byHouse.get(row.slug);
    if (existing) { existing.count += 1; continue; }
    byHouse.set(row.slug, {
      slug: row.slug,
      name: row.name,
      latin: (row.brandEn ?? row.brandName).toUpperCase(),
      city: row.city,
      count: 1,
    });
  }

  return [...byHouse.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

/**
 * The catalogue, narrowed.
 *
 * Every filter is applied in SQL rather than fetched-then-filtered. With three
 * products the difference is invisible and with three hundred it is the whole
 * page — and the version that reads everything first is the version nobody
 * rewrites until it is already slow in front of customers.
 *
 * The text match compares the customer's folded query against the folded
 * `search_text` column. Both sides went through the SAME function, which is the
 * only reason ليل القاهره finds ليل القاهرة. See `arabic-search.ts`.
 */
export interface SearchResult {
  products: ProductCard[];
  /** Every live house with something published, for the filter panel. */
  houses: Array<{ slug: string; name: string }>;
  total: number;
}

export async function searchCatalogue(query: CatalogueQuery): Promise<SearchResult> {
  const db = database();

  const conditions = [eq(schema.products.status, 'published')];

  for (const term of queryTerms(query)) {
    // AND across terms: two words is a customer narrowing down, and matching
    // either would return the whole amber section and bury what they asked for.
    conditions.push(like(schema.products.searchText, `%${term}%`));
  }

  if (query.families.length > 0) {
    conditions.push(inArray(schema.products.scentFamily, [...query.families]));
  }

  if (query.inStockOnly) conditions.push(gt(schema.products.stock, 0));

  /*
   * Price compares against what the customer would PAY.
   *
   * `promo_price_piastres` when there is one, otherwise the list price — the
   * same expression the product card renders. Filtering on the list price while
   * showing the promotional one puts a bottle marked 400 outside a "under 500"
   * filter, and the customer is looking straight at the number that says it
   * should be there.
   */
  const payable = sql`coalesce(${schema.products.promoPricePiastres}, ${schema.products.pricePiastres})`;
  if (query.minEgp !== null) conditions.push(sql`${payable} >= ${query.minEgp * 100}`);
  if (query.maxEgp !== null) conditions.push(sql`${payable} <= ${query.maxEgp * 100}`);

  if (query.houses.length > 0) {
    conditions.push(inArray(schema.sellers.slug, [...query.houses]));
  }

  const order = query.sort === 'price_asc' ? asc(payable)
    : query.sort === 'price_desc' ? desc(payable)
      : desc(schema.products.createdAt);

  const rows = await db
    .select({ p: schema.products, brandEn: schema.brands.nameEn, brandName: schema.brands.name })
    .from(schema.products)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
    .where(and(...conditions, eq(schema.sellers.status, 'live')))
    .orderBy(order);

  /*
   * The house list is NOT filtered by the current query.
   *
   * A filter panel that only offers what the current results contain is a panel
   * that traps you: pick one house and every other house vanishes from the
   * list, so there is no way to switch to another without clearing everything
   * first. The options are what the catalogue holds; the results are what the
   * query returns.
   */
  const houseRows = await db
    .selectDistinct({ slug: schema.sellers.slug, name: schema.sellers.tradingName })
    .from(schema.sellers)
    .innerJoin(schema.products, eq(schema.products.sellerId, schema.sellers.id))
    .where(and(
      eq(schema.sellers.status, 'live'),
      eq(schema.products.status, 'published'),
    ))
    .orderBy(asc(schema.sellers.tradingName));

  const photos = await primaryPhotos(rows.map((r) => r.p.id));

  return {
    products: rows.map((r) => toCard(r.p, (r.brandEn ?? r.brandName).toUpperCase(), photos)),
    houses: houseRows,
    total: rows.length,
  };
}

export { unitOfWork };
