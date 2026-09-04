/**
 * The catalogue's controlled vocabularies.
 *
 * CLAUDE.md §4: "Controlled vocabularies only — free text where an enum belongs
 * is a bug." Doc 01 §8 calls the normalised Egyptian scent catalogue the
 * defensible asset, and it only stays defensible while these stay closed: a
 * free-text scent family gives you nine spellings of "عود" and no way to filter
 * by any of them.
 *
 * These existed only as Postgres enums and as a Drizzle mirror of them, which
 * meant the boundary schema had no list to derive from and would have had to
 * retype every one. Four hand-written copies of the same vocabulary is how the
 * seller portal came to offer a decline reason that nothing accepted.
 *
 * `parity.test.ts` holds each of these against its database enum.
 */

export const CONCENTRATIONS = [
  'parfum', 'eau_de_parfum', 'eau_de_toilette', 'eau_de_cologne',
  // The three that matter in this market and appear in no Western taxonomy:
  // pure oil, attar, and the body mist that competes on price.
  'oil', 'attar', 'body_mist',
] as const;

export const PRODUCT_FORMS = ['spray', 'roll_on', 'dab', 'solid'] as const;

export const GENDER_POSITIONINGS = ['men', 'women', 'unisex'] as const;

export const SCENT_FAMILIES = [
  'oud', 'amber', 'woody', 'floral', 'fresh', 'gourmand', 'musk',
] as const;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export const DAY_NIGHT = ['day', 'night', 'both'] as const;

export const OCCASIONS = ['daily', 'work', 'evening', 'occasion', 'gift'] as const;

/** Defined bands, never a number. Doc 06 §4 requires the band and its source. */
export const PROJECTION_BANDS = ['intimate', 'moderate', 'strong', 'enormous'] as const;

export const LONGEVITY_BANDS = ['weak', 'moderate', 'long', 'very_long'] as const;

/**
 * Where a performance claim came from.
 *
 * A band with no disclosed source is a seller's opinion printed as a fact, and
 * doc 06 §4 forbids exactly that. The database's publish gate refuses it too.
 */
export const PERFORMANCE_SOURCES = [
  'seller_provided', 'platform_test', 'review_aggregate',
] as const;

export const RETURN_ELIGIBILITIES = [
  'sealed_only', 'sealed_or_defect', 'defect_only', 'not_returnable',
] as const;

export type Concentration = (typeof CONCENTRATIONS)[number];
export type ProductForm = (typeof PRODUCT_FORMS)[number];
export type GenderPositioning = (typeof GENDER_POSITIONINGS)[number];
export type ScentFamily = (typeof SCENT_FAMILIES)[number];
export type Season = (typeof SEASONS)[number];
export type DayNight = (typeof DAY_NIGHT)[number];
export type Occasion = (typeof OCCASIONS)[number];
export type ProjectionBand = (typeof PROJECTION_BANDS)[number];
export type LongevityBand = (typeof LONGEVITY_BANDS)[number];
export type PerformanceSource = (typeof PERFORMANCE_SOURCES)[number];
export type ReturnEligibility = (typeof RETURN_ELIGIBILITIES)[number];
