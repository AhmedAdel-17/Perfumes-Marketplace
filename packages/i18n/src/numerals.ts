/**
 * Numerals.
 *
 * Founder decision, 1 September 2026: MIXED by context — with a rule strict
 * enough that it reads as intentional rather than sloppy.
 *
 *   Arabic-Indic (٠١٢٣٤٥٦٧٨٩) is EDITORIAL.
 *   Western (0123456789) is DATA.
 *
 * The distinction is categorical, by kind of number, never by location. This
 * module is the ONLY place the decision is made, so it cannot drift across six
 * apps and dozens of components.
 *
 * Pattern — Strategy behind a single entry point.
 */

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export type NumeralContext =
  /** Prose: headline counts, founding years, campaign copy. Set in Amiri. */
  | 'editorial'
  /** Anything scannable, comparable or actionable. The default. */
  | 'data';

/** Surfaces that are operating tools, never brand surfaces. Always Western. */
export type Surface = 'customer' | 'internal';

const toArabicIndic = (s: string): string =>
  s.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]!);

const groupThousands = (whole: string): string =>
  whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export interface FormatOptions {
  context?: NumeralContext;
  surface?: Surface;
  /** Thousands separators. Off for years and order references. */
  group?: boolean;
  decimals?: number;
}

/**
 * The single decision point.
 *
 * Seller portal, admin, CMS and BI pass surface: 'internal' and always receive
 * Western digits — editorial numerals are a customer-facing brand device only.
 */
export function formatNumber(value: number, options: FormatOptions = {}): string {
  const { context = 'data', surface = 'customer', group = true, decimals } = options;

  const fixed = decimals === undefined ? String(value) : value.toFixed(decimals);
  const negative = fixed.startsWith('-');
  const [whole = '0', fraction] = fixed.replace('-', '').split('.');

  let out = group ? groupThousands(whole) : whole;
  if (fraction) out += '.' + fraction;
  if (negative) out = '−' + out;

  const useArabicIndic = context === 'editorial' && surface === 'customer';
  return useArabicIndic ? toArabicIndic(out) : out;
}

/**
 * Prices are ALWAYS Western — including inside an Arabic-Indic sentence.
 *
 * Price is the most compared value on the page, and comparability outranks tone.
 * There is deliberately no option to render a price in Arabic-Indic digits.
 */
export function formatPrice(piastres: number, options: { decimals?: boolean } = {}): string {
  const major = Math.trunc(Math.abs(piastres) / 100);
  const minor = Math.abs(piastres) % 100;
  const sign = piastres < 0 ? '−' : '';
  const showDecimals = options.decimals ?? minor !== 0;
  const body = showDecimals
    ? `${groupThousands(String(major))}.${String(minor).padStart(2, '0')}`
    : groupThousands(String(major));
  return sign + body;
}

/** The currency label is a letterspaced Latin word, never a glyph on the number. */
export const CURRENCY_LABEL = 'EGP';

/** Editorial helper: counts inside Amiri headings. */
export const editorial = (n: number, group = true): string =>
  formatNumber(n, { context: 'editorial', group });

/** Data helper: the default everywhere else. */
export const data = (n: number, group = true): string =>
  formatNumber(n, { context: 'data', group });
