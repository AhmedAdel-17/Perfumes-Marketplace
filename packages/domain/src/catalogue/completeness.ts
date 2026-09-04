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
 * WHAT IS DELIBERATELY NOT REQUIRED. Media and attribution are two of doc 04's
 * eight groups and neither is checked here, because neither is built yet.
 * Requiring a field the system cannot store would make submission impossible;
 * pretending the rule is complete would be worse. `UNENFORCED_GROUPS` names
 * them so the gap is visible rather than forgotten.
 */

/** Groups from doc 04 §4 that this function does not yet enforce. */
export const UNENFORCED_GROUPS = ['media', 'attribution'] as const;

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
