/**
 * Reviews.
 *
 * The homepage promises "تقييمات موثّقة بالشراء" — purchase-verified ratings —
 * and this module is what makes that sentence true rather than decorative.
 *
 * VERIFIED IS STRUCTURAL, NOT A FLAG. There is no `verified` column and no code
 * path that sets one, because a boolean is something a bug can set wrongly. A
 * review row cannot exist without a `line_item_id` pointing at a DELIVERED
 * sub-order — migration 0001's trigger refuses the insert otherwise — so every
 * review in the table is a review of something somebody actually received. The
 * badge on the screen is a statement about the schema.
 *
 * SIX DIMENSIONS, NOT ONE STAR. A single star rating on a perfume answers
 * nothing: "3/5" from someone who loved the scent and hated the sillage is the
 * same number as "3/5" from someone who found it mediocre throughout, and a
 * buyer cannot tell those apart. The six are the questions a perfume buyer
 * actually has, and one of them — `descriptionAccuracy` — exists to police the
 * seller rather than to describe the perfume.
 */
import { InvalidTransition } from '../errors/index';

/**
 * The six, in the order they are asked and displayed.
 *
 * A tuple rather than a set: the running order IS the design, the same way the
 * homepage's featured order is. Scent first because it is why somebody bought
 * the bottle; accuracy last because it is the question about us.
 */
export const REVIEW_DIMENSIONS = [
  'scent',
  'longevity',
  'projection',
  'value',
  'packaging',
  'descriptionAccuracy',
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

/**
 * The dimension that polices sellers, named so no caller has to remember which
 * of the six it is.
 *
 * A house whose listings promise more than the bottle delivers scores badly
 * here while scoring fine everywhere else, and that separation is the entire
 * reason the dimension exists. Anything that averages it away — including a
 * well-meaning "overall score" that a listing then displays alone — throws away
 * the one signal moderation can act on.
 */
export const ACCURACY_DIMENSION: ReviewDimension = 'descriptionAccuracy';

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * Longer than this is a blog post, and nobody reads the seventh paragraph of a
 * perfume review. It is also the length at which a text column stops being
 * something a moderator can scan.
 */
export const REVIEW_BODY_MAX = 1_200;

export type Ratings = Readonly<Record<ReviewDimension, number>>;

export type ReviewObjection =
  | 'rating_out_of_range'
  | 'rating_not_whole'
  | 'body_too_long';

/**
 * Whether a submitted review can be recorded, and EVERY reason it cannot.
 *
 * All of them rather than the first, the same rule the page editor and the
 * announcement window follow: somebody who fixes one fault and is immediately
 * shown the next stops trusting the form.
 */
export function objectionsToReview(input: {
  readonly ratings: Ratings;
  readonly body: string | null;
}): ReviewObjection[] {
  const objections: ReviewObjection[] = [];

  for (const dimension of REVIEW_DIMENSIONS) {
    const value = input.ratings[dimension];
    if (!Number.isFinite(value) || value < RATING_MIN || value > RATING_MAX) {
      if (!objections.includes('rating_out_of_range')) objections.push('rating_out_of_range');
      continue;
    }
    // 4.5 stars is a rating nobody typed. It arrives from a slider somebody
    // built without reading this, and it would quietly skew every average that
    // is otherwise a mean of whole numbers.
    if (!Number.isInteger(value) && !objections.includes('rating_not_whole')) {
      objections.push('rating_not_whole');
    }
  }

  if ((input.body ?? '').trim().length > REVIEW_BODY_MAX) objections.push('body_too_long');

  return objections;
}

/** A summary of many reviews. Null averages mean "nobody has said yet". */
export interface ReviewSummary {
  readonly count: number;
  /**
   * The mean of the six dimension means.
   *
   * Every dimension is NOT NULL on every row, so this equals the mean of all
   * ratings — stated as the mean of means because that stays correct if a
   * dimension is ever made optional, and the alternative silently starts
   * weighting whichever dimension people answer most.
   */
  readonly overall: number | null;
  readonly byDimension: Readonly<Record<ReviewDimension, number | null>>;
}

export const EMPTY_SUMMARY: ReviewSummary = {
  count: 0,
  overall: null,
  byDimension: {
    scent: null, longevity: null, projection: null,
    value: null, packaging: null, descriptionAccuracy: null,
  },
};

/**
 * Average a set of reviews.
 *
 * DELIBERATELY NOT ROUNDED. Rounding is a presentation decision and it is made
 * once, at the edge, by `formatRating`. A domain that rounds to one decimal and
 * a screen that rounds again produces 4.45 → 4.5 → 5, and the third number is a
 * lie the second one told.
 */
export function summarise(reviews: readonly Ratings[]): ReviewSummary {
  if (reviews.length === 0) return EMPTY_SUMMARY;

  const byDimension = Object.fromEntries(
    REVIEW_DIMENSIONS.map((dimension) => [
      dimension,
      reviews.reduce((sum, r) => sum + r[dimension], 0) / reviews.length,
    ]),
  ) as Record<ReviewDimension, number>;

  const overall = REVIEW_DIMENSIONS
    .reduce((sum, d) => sum + byDimension[d], 0) / REVIEW_DIMENSIONS.length;

  return { count: reviews.length, overall, byDimension };
}

/**
 * The name shown beside a public review.
 *
 * A marketplace that prints a customer's full legal name under a review has
 * published it next to something they bought and the house it came from — for a
 * purchase they made, not a profile they created. The Egyptian convention, and
 * the one every reader already understands, is the given name and an initial.
 *
 * It lives in the domain rather than in one adapter's SQL because BOTH adapters
 * call it and the contract test asserts on the result: a masking rule that
 * exists in one implementation is a masking rule that leaks from the other.
 */
export function publicAuthorName(fullName: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'عميل ديار';

  const given = parts[0]!;
  // A single-token name stays as it is. There is no surname to reduce, and
  // inventing an initial from the given name would print "أحمد أ.".
  if (parts.length === 1) return given;

  // The FIRST letter, taken with `[...]` rather than `charAt` — an Arabic
  // letter is one code point here, but a name pasted with a combining mark
  // would slice mid-character and render a lone diacritic.
  const initial = [...parts[1]!][0]!;
  return `${given} ${initial}.`;
}

/**
 * One decimal, and never a trailing ".0".
 *
 * "4.0" reads as a measurement; "4" reads as a rating. The distinction matters
 * on a product page where the number sits beside a price that is genuinely
 * precise.
 */
export function formatRating(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Hide a review.
 *
 * Moderation removes ABUSE, NOT CRITICISM (doc 06 §10) — and the enforcement of
 * that sentence is not in this function, which cannot read a review's meaning.
 * It is in three structural facts: hiding requires a written note, hiding is a
 * platform action that no house can perform, and nothing anywhere deletes the
 * row. A house that wants a bad review gone has to ask an operator who has to
 * write down why, in a log the house cannot edit.
 */
export function objectionsToHiding(note: string): 'note_required'[] {
  return note.trim().length === 0 ? ['note_required'] : [];
}

/**
 * A review already hidden cannot be hidden again, and one never hidden cannot
 * be restored.
 *
 * Both are thrown rather than ignored: a second hide would overwrite the note
 * explaining the first, which is the record of why criticism was removed, and
 * a no-op restore hides the fact that an operator's click did nothing.
 */
export function assertHideable(hiddenAt: Date | null): void {
  if (hiddenAt !== null) throw new InvalidTransition('hidden', 'hidden', 'review');
}

export function assertRestorable(hiddenAt: Date | null): void {
  if (hiddenAt === null) throw new InvalidTransition('visible', 'visible', 'review');
}
