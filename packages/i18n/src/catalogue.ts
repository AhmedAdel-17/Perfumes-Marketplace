import type { Locale } from './locale';
/**
 * Listing and page vocabularies, in Arabic.
 *
 * WHY THESE MOVED HERE. Each of these maps was written twice, in the two
 * screens that happened to need it first — the listing states in the seller's
 * list and in the listing form, the moderation reasons in the seller's list and
 * in the platform's queue, the page states in the content list and the page
 * editor. They agreed, by care rather than by construction. The audit screen
 * needed all three, and a third copy is where two copies stop agreeing.
 *
 * Typed by their keys rather than against the domain's unions, because this
 * package does not depend on the domain. The screens that use them still
 * declare `Record<ListingState, string>`, so a state added to the domain
 * without a word here fails to compile there.
 */

export const LISTING_STATE_AR = {
  draft: 'مسودة',
  pending_moderation: 'قيد المراجعة',
  published: 'منشور',
  suspended: 'موقوف',
  archived: 'مؤرشف',
} as const;

export const MODERATION_REASON_AR = {
  prohibited_claim: 'ادّعاء ممنوع',
  missing_required_fields: 'بيانات ناقصة',
  unsupported_claim: 'ادّعاء بلا دليل',
  misleading_media: 'صور مضلّلة',
  implausible_pricing: 'سعر غير منطقي',
  duplicate_listing: 'منتج مكرّر',
  restricted_ingredient: 'مكوّن مقيّد',
} as const;

export const PAGE_STATE_AR = {
  draft: 'مسودة',
  in_review: 'قيد المراجعة',
  published: 'منشورة',
  archived: 'مؤرشفة',
} as const;

/* ------------------------------------------------- the shopfront's own words */

/**
 * The vocabularies a product page and a product card read from.
 *
 * MOVED HERE 20 September 2026 (task P3.4.1, ADR-10). They lived in
 * `apps/web/src/core/catalogue.ts`, beside the SQL that fetched the rows they
 * label — which meant the only way to render a scent family in Arabic was to
 * query the database first. The native apps would have needed a second copy,
 * and the second copy is where two copies stop agreeing.
 *
 * Keyed by the database's controlled vocabulary, not by a domain union, for the
 * reason the maps above are: this package depends on nothing. The read model
 * that consumes them declares the union, so a family added to the enum without
 * a word here fails to compile there.
 */
export const SCENT_FAMILY_AR = {
  oud: 'عود',
  amber: 'عنبر',
  woody: 'خشبي',
  floral: 'زهري',
  fresh: 'منعش',
  gourmand: 'حلواني',
  musk: 'مسك',
} as const;

export const CONCENTRATION_AR = {
  parfum: 'بارفان',
  eau_de_parfum: 'أو دو بارفان',
  eau_de_toilette: 'أو دو تواليت',
  eau_de_cologne: 'أو دو كولون',
  oil: 'زيت',
  attar: 'عطر مركّز',
  body_mist: 'بخاخ للجسم',
} as const;

/**
 * Performance bands — the Arabic word, the Latin label, and how full the meter
 * sits.
 *
 * Three maps rather than one record of objects because they are read in three
 * different places and at different times: the word and the label are copy, and
 * the fill is a design token in all but name. Keeping them separate is what
 * lets a screen take the word without also taking a number it does not render.
 *
 * `BAND_FILL` is a PERCENTAGE, and the meter fills from the right
 * (`CLAUDE.md` §14). A band with no fill here gets 50, which reads as "we do
 * not know" rather than as zero — an empty meter is a claim, and the wrong one.
 */
export const BAND_AR = {
  weak: 'خفيف',
  moderate: 'متوسّط',
  long: 'طويل',
  very_long: 'طويل جدًا',
  intimate: 'قريب',
  strong: 'قوي',
  enormous: 'واسع',
} as const;

export const BAND_EN = {
  weak: 'WEAK',
  moderate: 'MODERATE',
  long: 'LONG',
  very_long: 'VERY LONG',
  intimate: 'INTIMATE',
  strong: 'STRONG',
  enormous: 'ENORMOUS',
} as const;

export const BAND_FILL = {
  weak: 25,
  moderate: 52,
  long: 74,
  very_long: 92,
  intimate: 28,
  strong: 76,
  enormous: 95,
} as const;

/**
 * Where a performance claim came from — doc 06 §4.
 *
 * A band must disclose its source, because a seller's own estimate and a
 * platform test are not the same kind of fact, and `CLAUDE.md` §4 forbids
 * presenting the first as the second. The sentence is shown, not the enum.
 */
export const PERFORMANCE_SOURCE_AR = {
  seller_provided: 'المصدر: بيانات الدار',
  platform_test: 'المصدر: اختبار المنصّة',
  review_aggregate: 'المصدر: متوسّط تقييمات المشترين',
} as const;

/*
 * The English site's vocabulary for the same codes (D-3). Each table is checked
 * against its Arabic twin, so a code added to one and forgotten in the other is
 * a compile error rather than a blank label.
 */
export const SCENT_FAMILY_EN = {
  oud: 'Oud',
  amber: 'Amber',
  woody: 'Woody',
  floral: 'Floral',
  fresh: 'Fresh',
  gourmand: 'Gourmand',
  musk: 'Musk',
} as const satisfies Record<keyof typeof SCENT_FAMILY_AR, string>;

export const CONCENTRATION_EN = {
  parfum: 'Parfum',
  eau_de_parfum: 'Eau de parfum',
  eau_de_toilette: 'Eau de toilette',
  eau_de_cologne: 'Eau de cologne',
  oil: 'Perfume oil',
  attar: 'Attar',
  body_mist: 'Body mist',
} as const satisfies Record<keyof typeof CONCENTRATION_AR, string>;

export const PERFORMANCE_SOURCE_EN = {
  seller_provided: 'Source: the house',
  platform_test: 'Source: DIYAR testing',
  review_aggregate: 'Source: average of buyer reviews',
} as const satisfies Record<keyof typeof PERFORMANCE_SOURCE_AR, string>;

export type ScentFamily = keyof typeof SCENT_FAMILY_AR;
export type Concentration = keyof typeof CONCENTRATION_AR;
export type PerformanceBand = keyof typeof BAND_AR;
export type PerformanceSource = keyof typeof PERFORMANCE_SOURCE_AR;

export const SCENT_FAMILY = { ar: SCENT_FAMILY_AR, en: SCENT_FAMILY_EN } as const;
export const CONCENTRATION = { ar: CONCENTRATION_AR, en: CONCENTRATION_EN } as const;
export const PERFORMANCE_SOURCE = { ar: PERFORMANCE_SOURCE_AR, en: PERFORMANCE_SOURCE_EN } as const;

/**
 * A code's label in a locale, or the code itself when it is unknown — a new
 * enum value the tables have not caught up with shows as its code, visibly
 * wrong, rather than as an empty space nobody notices.
 */
export function labelOf(
  table: Readonly<Record<Locale, Readonly<Record<string, string>>>>,
  locale: Locale,
  code: string | null | undefined,
): string {
  if (!code) return '';
  return table[locale][code] ?? code;
}
