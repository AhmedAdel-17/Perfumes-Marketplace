import 'server-only';
import { unitOfWork } from './db';
import { and, eq } from 'drizzle-orm';
import { schema } from '@diyar/db';
import { database } from './db';

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

export interface ProductCard {
  id: string; slug: string; name: string; brandLatin: string;
  pricePiastres: number; volumeMl: number; familyLabel: string;
  /** Raw scent-family token key — drives the flacon render. */
  family: string;
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

const toCard = (row: typeof schema.products.$inferSelect, brandLatin: string): ProductCard => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  brandLatin,
  pricePiastres: row.promoPricePiastres ?? row.pricePiastres,
  volumeMl: row.volumeMl,
  familyLabel: FAMILY_AR[row.scentFamily ?? ''] ?? '',
  family: row.scentFamily ?? 'amber',
});

export async function listPublishedProducts(): Promise<ProductCard[]> {
  const db = database();
  const rows = await db
    .select({ p: schema.products, brandEn: schema.brands.nameEn, brandName: schema.brands.name })
    .from(schema.products)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(eq(schema.products.status, 'published'));

  return rows.map((r) => toCard(r.p, (r.brandEn ?? r.brandName).toUpperCase()));
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

  return {
    ...toCard(row.p, (row.brandEn ?? row.brandName).toUpperCase()),
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

  return {
    slug: house.s.slug,
    name: house.s.tradingName,
    latin: (brand?.nameEn ?? brand?.name ?? house.s.tradingName).toUpperCase(),
    bio: house.s.bio,
    story: house.s.story,
    foundedYear: house.s.foundedYear,
    city: house.s.city,
    serviceGovernorates: house.s.serviceGovernorates ?? [],
    products: rows.map((r) => toCard(r.p, (r.brandEn ?? r.brandName).toUpperCase())),
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

export { unitOfWork };
