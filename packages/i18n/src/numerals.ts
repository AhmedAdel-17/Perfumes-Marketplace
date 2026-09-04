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

/**
 * The inverse: whatever numerals a person TYPED, as Western digits.
 *
 * An Egyptian keyboard produces ٠١٢…, and a customer typing their own phone
 * number in their own numerals is not making a mistake. Without this they meet
 * "invalid Egyptian mobile number" over a number that is plainly correct to
 * them, with nothing on screen suggesting what to change — the single most
 * frustrating shape a form error can take.
 *
 * Two ranges, not one. U+0660 is the Arabic-Indic set; U+06F0 is the extended
 * set used for Persian and Urdu, and several Android Arabic keyboards emit it.
 * Handling only the first would fix the fault for most people and leave it
 * exactly as impassable for the rest.
 *
 * Conversion happens at the INPUT, where the field shows what it understood.
 * Doing it inside the validation schema would hide it: the schema is also the
 * identity boundary, and a phone number silently rewritten there could make one
 * person into two customers depending on which keyboard they used.
 */
export const westernDigits = (input: string): string =>
  input.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06F0 ? 0x06F0 : 0x0660;
    return String(code - base);
  });

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
/**
 * Operating tools: the seller portal, ops, CMS and BI.
 *
 * Always Western, whatever the context — editorial numerals are a
 * customer-facing brand device and a house counting its own orders is not
 * being marketed to.
 *
 * It exists as its own helper rather than being reached through `data()`
 * because those calls landed on the right digits for the wrong reason: nothing
 * in them said "internal", so a later change to `editorial()` in the seller
 * portal would have silently broken the rule while every test stayed green.
 * A call site should state which rule it is obeying.
 */
export const internal = (n: number, group = true): string =>
  formatNumber(n, { context: 'data', surface: 'internal', group });

export const data = (n: number, group = true): string =>
  formatNumber(n, { context: 'data', group });
