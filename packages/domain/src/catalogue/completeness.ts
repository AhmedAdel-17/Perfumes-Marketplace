/**
 * Whether a listing is complete enough to submit.
 *
 * Doc 04 §4 defines the catalogue schema in eight groups and says "no listing
 * publishes with missing required fields". This is that rule, in one place.
 *
 * IT RUNS AT SUBMISSION, NOT WHILE TYPING. A draft is allowed to be
 * half-written — that is what a draft is — and a form that argues with somebody
 * before they have finished the first field teaches them to fight the form.
 *
 * Every gap is reported at once, for the same reason every other form on this
 * site does it: a person who fixes one problem and is immediately shown the
 * next gives up somewhere around the third.
 *
 * IT MUST AGREE WITH THE DATABASE. Migration 0001 carries a trigger that
 * refuses to publish a listing with missing required fields, and this function
 * is the readable copy of that rule — the one a form can consult before a
 * seller presses anything. Two copies is deliberate (ENGINEERING_PRINCIPLES
 * §4: one place to read the rule, one place it cannot be evaded), and it is
 * only defensible while they say the same thing, which `publish-gate-parity`
 * asserts field by field.
 *
 * The first version of this file did NOT agree. It declared media unenforced
 * on the grounds that it was not built — and `product_media` has existed since
 * the initial migration, with the database requiring a primary image whose
 * ownership the seller has confirmed and whose alt text is not blank. A listing
 * would have passed this check, told the seller it was ready, and then been
 * refused by the database at the moment of publishing with an error they had
 * no way to anticipate.
 *
 * WHAT IS STILL NOT REQUIRED. Attribution — doc 04 §4's eighth group — is
 * checked by neither layer. `UNENFORCED_GROUPS` names it so the gap stays
 * visible instead of being forgotten.
 */

/** Groups from doc 04 §4 that neither this nor the database enforces. */
export const UNENFORCED_GROUPS = ['attribution'] as const;

export const LISTING_FIELDS = [
  // Identity
  'name', 'slug', 'sku', 'brandId',
  // Commerce
  'pricePiastres', 'volumeMl', 'fulfilmentHours',
  // Product
  'concentration', 'form', 'genderPositioning', 'scentFamily',
  'notesTop', 'notesHeart', 'notesBase',
  // Use
  'seasons', 'dayNight', 'occasions', 'projectionBand', 'longevityBand',
  'performanceSource',
  // Compliance
  'responsiblePartyName', 'returnEligibility', 'defectRoute',
  /*
   * Media. Not a column on the product — it is a row in `product_media` that is
   * primary, has confirmed ownership, and has non-blank alt text. The caller
   * resolves that to a boolean, because this module performs no I/O.
   */
  'primaryImage',
] as const;

export type ListingField = (typeof LISTING_FIELDS)[number];

/**
 * A listing as this check sees it.
 *
 * Everything optional, because the whole point is to be handed something
 * incomplete and say what is missing. A type that demanded the fields would
 * make the function impossible to call with the input it exists to inspect.
 */
export interface ListingDraft {
  name?: string | null;
  /** Optional English name (D-3). Never required to publish. */
  nameEn?: string | null;
  slug?: string | null;
  sku?: string | null;
  brandId?: string | null;
  pricePiastres?: number | null;
  promoPricePiastres?: number | null;
  volumeMl?: number | null;
  stock?: number | null;
  fulfilmentHours?: number | null;
  concentration?: string | null;
  form?: string | null;
  genderPositioning?: string | null;
  scentFamily?: string | null;
  notesTop?: readonly string[] | null;
  notesHeart?: readonly string[] | null;
  notesBase?: readonly string[] | null;
  seasons?: readonly string[] | null;
  dayNight?: string | null;
  occasions?: readonly string[] | null;
  projectionBand?: string | null;
  longevityBand?: string | null;
  performanceSource?: string | null;
  responsiblePartyName?: string | null;
  returnEligibility?: string | null;
  defectRoute?: string | null;
  /**
   * Whether a primary image exists with confirmed ownership and alt text.
   *
   * A boolean rather than the media rows themselves: the rule is about whether
   * one qualifies, and handing this module a list would invite it to grow
   * opinions about media it has no business having.
   */
  primaryImage?: boolean | null;
}

export type ListingGapCode =
  /** Absent, blank, or an empty array — nothing was entered. */
  | 'missing'
  /**
   * Entered, well-formed, and wrong: a price of zero, a promotional price
   * above the price, a fulfilment promise of three weeks.
   *
   * There was a third code, `empty`, for "present but not usable". It only ever
   * applied to numbers that are also implausible, so it was one vocabulary word
   * describing the same thing twice — and an unused code in an enum is a word
   * that eventually gets used for something it does not mean.
   */
  | 'implausible';

export interface ListingGap {
  readonly field: ListingField | 'promoPricePiastres' | 'stock';
  readonly code: ListingGapCode;
}

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined
  || (typeof value === 'string' && value.trim().length === 0)
  || (Array.isArray(value) && value.length === 0);

export function listingGaps(draft: ListingDraft): ListingGap[] {
  const gaps: ListingGap[] = [];

  for (const field of LISTING_FIELDS) {
    if (field === 'primaryImage') {
      // `false` is a legitimate value that means missing, and `isBlank` would
      // read it as present.
      if (!draft.primaryImage) gaps.push({ field, code: 'missing' });
      continue;
    }
    if (isBlank(draft[field])) gaps.push({ field, code: 'missing' });
  }

  /*
   * Numbers get a second look, because "present" is not the same as "usable".
   *
   * A price of zero passes a NOT NULL constraint and every required-field
   * check ever written, and it is a listing that sells a perfume for nothing.
   */
  if (draft.pricePiastres !== null && draft.pricePiastres !== undefined
    && draft.pricePiastres <= 0) {
    gaps.push({ field: 'pricePiastres', code: 'implausible' });
  }

  if (draft.volumeMl !== null && draft.volumeMl !== undefined && draft.volumeMl <= 0) {
    gaps.push({ field: 'volumeMl', code: 'implausible' });
  }

  // A promotional price that is not below the price is not a promotion; it is
  // a mistake that will be argued about in a support ticket.
  if (draft.promoPricePiastres !== null && draft.promoPricePiastres !== undefined) {
    if (draft.promoPricePiastres <= 0
      || (draft.pricePiastres != null && draft.promoPricePiastres >= draft.pricePiastres)) {
      gaps.push({ field: 'promoPricePiastres', code: 'implausible' });
    }
  }

  if (draft.stock !== null && draft.stock !== undefined && draft.stock < 0) {
    gaps.push({ field: 'stock', code: 'implausible' });
  }

  // A house promising same-hour dispatch is a house about to miss an SLA it set
  // itself, and one promising three weeks is not in this market.
  if (draft.fulfilmentHours !== null && draft.fulfilmentHours !== undefined
    && (draft.fulfilmentHours < 1 || draft.fulfilmentHours > 336)) {
    gaps.push({ field: 'fulfilmentHours', code: 'implausible' });
  }

  return gaps;
}

export const isListingComplete = (draft: ListingDraft): boolean =>
  listingGaps(draft).length === 0;
