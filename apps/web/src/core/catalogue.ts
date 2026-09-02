import 'server-only';
import { unitOfWork } from './db';
import { eq } from 'drizzle-orm';
import { schema } from '@diyar/db';
import { database } from './db';

/**
 * Read models for the public catalogue.
 *
 * These are the only place a database row becomes something a component renders.
 * Components receive plain data — never a Drizzle row, never a Money object —
 * so a change of storage cannot ripple into the design layer.
 */

/** Bottle gradients stand in until real photography exists (DESIGN_DOCTRINE §2). */
const BOTTLE: Record<string, string> = {
  oud: 'linear-gradient(100deg,#2E2318,#4A3328 38%,#6B4A38 52%,#241B14)',
  amber: 'linear-gradient(100deg,#4A3720,#8A6838 38%,#A37F4C 52%,#3A2B18)',
  woody: 'linear-gradient(100deg,#2E2A24,#5A5148 38%,#7A6F63 52%,#26221D)',
  floral: 'linear-gradient(100deg,#5A2E38,#A8536B 40%,#C07A90 54%,#4A2530)',
  fresh: 'linear-gradient(100deg,#26332E,#4A6B5E 40%,#5A8C7C 54%,#1E2A25)',
  gourmand: 'linear-gradient(100deg,#3A2A1E,#7A5236 40%,#9A6B4A 54%,#2E2018)',
  musk: 'linear-gradient(100deg,#3A3630,#6E675D 40%,#8E8578 54%,#2E2B26)',
};

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
  pricePiastres: number; volumeMl: number; familyLabel: string; bottle: string;
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
  bottle: BOTTLE[row.scentFamily ?? ''] ?? BOTTLE.amber!,
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

export { unitOfWork };
