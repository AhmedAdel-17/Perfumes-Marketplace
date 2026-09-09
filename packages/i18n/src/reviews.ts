/**
 * Review copy.
 *
 * The six dimensions in Arabic, plus the one sentence the whole feature rests
 * on. Kept here rather than in the component that renders them because the
 * mobile apps will render the same six, and a label typed twice is a label that
 * eventually says two things.
 */

/**
 * The question each dimension asks, in the customer's words.
 *
 * Short by design: they sit in a column beside six bars, and a label that wraps
 * turns a compact block into a list. They are also QUESTIONS rather than
 * nouns — "هل يدوم؟" is answerable by somebody who has worn the perfume for a
 * day; "الثبات" is a category heading and invites a shrug.
 */
export const REVIEW_DIMENSION_AR = {
  scent: 'الرائحة',
  longevity: 'الثبات',
  projection: 'الانتشار',
  value: 'مقابل السعر',
  packaging: 'التغليف',
  descriptionAccuracy: 'مطابقة الوصف',
} as const;

/** The longer prompt, shown beside the stars while somebody is rating. */
export const REVIEW_DIMENSION_PROMPT_AR = {
  scent: 'هل أعجبتك الرائحة نفسها؟',
  longevity: 'كم دام عليك؟',
  projection: 'هل يصل لمن حولك؟',
  value: 'يستحق سعره؟',
  packaging: 'وصل بحالة جيدة ومغلّف جيدًا؟',
  descriptionAccuracy: 'هل جاء كما وُصف في الصفحة؟',
} as const;

/**
 * The badge.
 *
 * It is a claim about the schema, not a moderation outcome: a review row cannot
 * exist without a line item on a delivered sub-order. Worded as a fact rather
 * than a boast for that reason.
 */
export const VERIFIED_PURCHASE_AR = 'شراء موثّق';

/** What an unreviewed perfume says. Never "٠ من ٥". */
export const NO_REVIEWS_YET_AR = 'لا توجد تقييمات بعد';
