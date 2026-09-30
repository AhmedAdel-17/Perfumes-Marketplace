import type { Locale } from './locale';
/**
 * Arabic pluralisation.
 *
 * English has two forms and every marketplace codebase written by an English
 * speaker therefore has `count === 1 ? 'perfume' : 'perfumes'` somewhere in it.
 * Arabic has SIX, and picking the wrong one is not a rounding error — it is the
 * difference between text a native reader trusts and text that reads as a badly
 * localised foreign product. "٣ عطر" is wrong the way "3 perfume" is wrong.
 *
 * The categories follow CLDR for `ar`:
 *
 *   zero   n = 0                          لا عطور
 *   one    n = 1                          عطر
 *   two    n = 2                          عطران
 *   few    n % 100 in 3..10               ٣ عطور
 *   many   n % 100 in 11..99              ١١ عطرًا
 *   other  everything else (100, 200, …)  ١٠٠ عطر
 *
 * Note that `few` and `many` depend on n MOD 100, so 103 is `few` and 111 is
 * `many`. This is the rule that hand-rolled implementations always miss.
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** The six forms a counted noun needs. */
export type PluralForms = Readonly<Record<PluralCategory, string>>;

export function pluralCategory(count: number): PluralCategory {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Plural category is defined for non-negative integers; got ${count}`);
  }
  if (count === 0) return 'zero';
  if (count === 1) return 'one';
  if (count === 2) return 'two';

  const mod100 = count % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

/** The noun alone, correctly inflected. The caller places the numeral. */
export function plural(count: number, forms: PluralForms): string {
  return forms[pluralCategory(count)];
}

/**
 * Counted nouns used across the surfaces.
 *
 * They live together rather than inline at each call site so that a form which
 * is wrong is wrong in exactly one place, and so that a reviewer who reads
 * Arabic can check the whole set at once.
 */
export const PERFUME: PluralForms = {
  zero: 'لا عطور',
  one: 'عطر',
  two: 'عطران',
  few: 'عطور',
  many: 'عطرًا',
  other: 'عطر',
};

export const HOUSE: PluralForms = {
  zero: 'لا دور',
  one: 'دار',
  two: 'داران',
  few: 'دور',
  many: 'دارًا',
  other: 'دار',
};

export const DAY: PluralForms = {
  zero: 'لا أيام',
  one: 'يوم',
  two: 'يومان',
  few: 'أيام',
  many: 'يومًا',
  other: 'يوم',
};

export const ORDER: PluralForms = {
  zero: 'لا طلبات',
  one: 'طلب',
  two: 'طلبان',
  few: 'طلبات',
  many: 'طلبًا',
  other: 'طلب',
};

export const SHIPMENT: PluralForms = {
  zero: 'لا شحنات',
  one: 'شحنة',
  two: 'شحنتان',
  few: 'شحنات',
  many: 'شحنةً',
  other: 'شحنة',
};

/**
 * A content block, as counted in the CMS console.
 *
 * `few` is the plural (3-10) and `many` is the accusative singular (11-99),
 * which is the pair everybody gets backwards: "٨ عنصرًا" is wrong and reads to
 * an Arabic speaker roughly the way "8 element" reads in English.
 */
export const BLOCK: PluralForms = {
  zero: 'لا عناصر',
  one: 'عنصر',
  two: 'عنصران',
  few: 'عناصر',
  many: 'عنصرًا',
  other: 'عنصر',
};

export const REVIEW: PluralForms = {
  zero: 'لا تقييمات',
  one: 'تقييم',
  two: 'تقييمان',
  few: 'تقييمات',
  many: 'تقييمًا',
  other: 'تقييم',
};

/**
 * An occurrence — "مرّة" — as the owner's report counts events.
 *
 * Added after QA found `٣ مرّة` on the pre-order funnel: the noun had been
 * written once, in the singular, beside a number that varies. That is the exact
 * mistake this module exists to prevent, made in new code by the person who
 * wrote the module.
 */
export const TIME: PluralForms = {
  zero: 'لا مرّات',
  one: 'مرّة',
  two: 'مرّتان',
  few: 'مرّات',
  many: 'مرّةً',
  other: 'مرّة',
};

/** A visitor, counted in the pre-order funnel. Distinct people, not page views. */
export const VISITOR: PluralForms = {
  zero: 'لا زوّار',
  one: 'زائر',
  two: 'زائران',
  few: 'زوّار',
  many: 'زائرًا',
  other: 'زائر',
};

/**
 * A count and its noun, assembled the way Arabic actually assembles them.
 *
 * The trap this closes: `zero`, `one` and `two` carry the count INSIDE the word
 * — "عطران" already means "two perfumes" — so prefixing a numeral produces
 * "٢ عطران", which reads as "two two-perfumes". Only `few`, `many` and `other`
 * take a leading numeral. Callers that reach for `plural()` and concatenate a
 * number themselves will get this wrong, so this is the function the surfaces
 * use and `plural()` is reserved for the cases that genuinely need the bare
 * noun.
 *
 * `format` is injected rather than imported so the caller decides between
 * Arabic-Indic and Western digits per the numeral rule, and this module stays
 * free of that policy.
 */
export function counted(
  count: number,
  forms: PluralForms,
  format: (n: number) => string,
): string {
  const category = pluralCategory(count);
  if (category === 'zero' || category === 'one' || category === 'two') {
    return forms[category];
  }
  return `${format(count)} ${forms[category]}`;
}

/**
 * English needs three forms, not six: nothing, one, and every other count.
 */
export interface EnglishForms {
  readonly zero: string;
  readonly one: string;
  readonly other: string;
}

/** A counted noun in every locale the site speaks. */
export interface Noun {
  readonly ar: PluralForms;
  readonly en: EnglishForms;
}

export const NOUN = {
  perfume: { ar: PERFUME, en: { zero: 'No perfumes', one: 'perfume', other: 'perfumes' } },
  house: { ar: HOUSE, en: { zero: 'No houses', one: 'house', other: 'houses' } },
  day: { ar: DAY, en: { zero: 'No days', one: 'day', other: 'days' } },
  order: { ar: ORDER, en: { zero: 'No orders', one: 'order', other: 'orders' } },
  shipment: { ar: SHIPMENT, en: { zero: 'No shipments', one: 'shipment', other: 'shipments' } },
  review: { ar: REVIEW, en: { zero: 'No reviews', one: 'review', other: 'reviews' } },
} as const satisfies Record<string, Noun>;

/**
 * `counted()`, in the visitor's language. Arabic keeps its own rules (the count
 * lives inside the word for zero, one and two); English always leads with the
 * number except for zero, which reads better as a phrase.
 */
export function countedIn(
  locale: Locale,
  count: number,
  noun: Noun,
  format: (n: number) => string,
): string {
  if (locale === 'ar') return counted(count, noun.ar, format);
  if (count === 0) return noun.en.zero;
  return `${format(count)} ${count === 1 ? noun.en.one : noun.en.other}`;
}
