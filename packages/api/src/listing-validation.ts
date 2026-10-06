/**
 * The listing boundary.
 *
 * Every controlled vocabulary here is a `z.enum` over the DOMAIN's list, not a
 * retyped one. The vocabularies exist three times already — domain constant,
 * Postgres enum, and this schema — and the only reason that is defensible is
 * that two of the three are derived and the third is checked by
 * `parity.test.ts`. A fourth hand-written copy would be the one that drifts,
 * exactly as the seller portal's decline reasons did.
 */
import { z } from 'zod';
import {
  CONCENTRATIONS, DAY_NIGHT, GENDER_POSITIONINGS, LONGEVITY_BANDS, OCCASIONS,
  PERFORMANCE_SOURCES, PRODUCT_FORMS, PROJECTION_BANDS, RETURN_ELIGIBILITIES,
  SCENT_FAMILIES, SEASONS,
} from '@diyar/domain';

/** A note is a short phrase — "برغموت", not a paragraph about bergamot. */
const note = z.string().trim().min(1).max(60);
const notes = z.array(note).max(12);

/**
 * A slug, on the same alphabet the rest of the site uses.
 *
 * It becomes a product URL and a product URL is forever, which is why it is set
 * once at creation and never appears in the edit schema below.
 */
const slug = z.string().trim().min(1).max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'معرّف غير صالح');

export const newListingSchema = z.object({
  name: z.string().trim().min(1, 'أدخل اسم العطر').max(160),
  slug,
  // A house's own stock-keeping code. Latin and digits because it is scanned,
  // printed and read aloud in a warehouse, not on the site.
  sku: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9-]+$/, 'رمز غير صالح'),
  brandId: z.string().uuid(),
}).strict();

/**
 * Everything a house may change afterwards.
 *
 * Note what is absent: `slug`, `brandId`, and every moderation column. A schema
 * that accepted a status would make the status a thing a caller can send, and
 * then the only defence would be a router remembering to ignore it.
 */
export const listingDraftSchema = z.object({
  name: z.string().trim().min(1).max(160).nullish(),
  // Empty means "no English name": the storefront then shows the Arabic one.
  nameEn: z.string().trim().max(160).nullish().transform((v) => (v === '' ? null : v)),
  sku: z.string().trim().min(1).max(60).nullish(),

  // Money as integer piastres, never a float — the same rule as everywhere.
  pricePiastres: z.number().int().min(0).max(100_000_000).nullish(),
  promoPricePiastres: z.number().int().min(0).max(100_000_000).nullish(),
  volumeMl: z.number().int().min(0).max(5_000).nullish(),
  stock: z.number().int().min(0).max(100_000).nullish(),
  fulfilmentHours: z.number().int().min(1).max(336).nullish(),

  concentration: z.enum(CONCENTRATIONS).nullish(),
  form: z.enum(PRODUCT_FORMS).nullish(),
  genderPositioning: z.enum(GENDER_POSITIONINGS).nullish(),
  scentFamily: z.enum(SCENT_FAMILIES).nullish(),

  /*
   * `.nullish()`, not `.optional()`.
   *
   * These columns are nullable, so a listing read back from the database
   * arrives with `notesTop: null` — and `.optional()` accepts `undefined` and
   * refuses `null`. The console loads a listing, sends it back untouched, and
   * the save was rejected by its own data. Nothing on screen said why, because
   * a schema failure is an internal error and internal errors are deliberately
   * generic.
   */
  notesTop: notes.nullish(),
  notesHeart: notes.nullish(),
  notesBase: notes.nullish(),

  seasons: z.array(z.enum(SEASONS)).max(4).nullish(),
  dayNight: z.enum(DAY_NIGHT).nullish(),
  occasions: z.array(z.enum(OCCASIONS)).max(5).nullish(),
  projectionBand: z.enum(PROJECTION_BANDS).nullish(),
  longevityBand: z.enum(LONGEVITY_BANDS).nullish(),

  /*
   * Doc 06 §4: a performance band must disclose whether it came from the
   * seller, a platform test or aggregated reviews.
   *
   * "A performance band without a disclosed source is a seller claim dressed as
   * fact" — the database says so too, in the 0001 publish gate.
   */
  performanceSource: z.enum(PERFORMANCE_SOURCES).nullish(),

  responsiblePartyName: z.string().trim().min(1).max(200).nullish(),
  returnEligibility: z.enum(RETURN_ELIGIBILITIES).nullish(),
  defectRoute: z.string().trim().min(1).max(500).nullish(),
}).strict();
