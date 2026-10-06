/**
 * Locales, and the one place their facts live.
 *
 * Arabic is the default and owns the unprefixed URLs, so every link a house has
 * already put in an Instagram bio keeps working. English lives under `/en`
 * (D-3, decided 30 Sep 2026): a separate URL per language is what lets a search
 * engine index both and pair them with `hreflang`, which a cookie-only switch
 * cannot do.
 */
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

/** The URL segment English lives under. Arabic has none. */
export const EN_PREFIX = '/en';

/** The cookie that remembers the last language a visitor chose or opened. */
export const LOCALE_COOKIE = 'diyar-locale';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

export const directionOf = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr');

/** True when a browser path belongs to the English site. */
export const isEnglishPath = (path: string): boolean =>
  path === EN_PREFIX || path.startsWith(`${EN_PREFIX}/`) || path.startsWith(`${EN_PREFIX}?`);

/** A browser path with the language prefix removed: `/en/houses` → `/houses`. */
export function stripLocale(path: string): string {
  if (!isEnglishPath(path)) return path;
  const rest = path.slice(EN_PREFIX.length);
  return rest === '' || rest.startsWith('?') ? `/${rest}` : rest;
}

/**
 * An internal path in a given language: `('en', '/houses')` → `/en/houses`.
 *
 * Only for paths that start with `/`. An absolute or protocol-relative URL is
 * returned untouched, because a link out of the site has no language of ours.
 */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const bare = stripLocale(path);
  if (locale === DEFAULT_LOCALE) return bare;
  return bare === '/' ? EN_PREFIX : bare.startsWith('/?') ? `${EN_PREFIX}${bare.slice(1)}` : `${EN_PREFIX}${bare}`;
}

/** A piece of content, and the language it is actually in. */
export interface Picked {
  readonly text: string;
  readonly lang: Locale;
}

/**
 * The English version of a piece of content when the page is English and one
 * exists; otherwise the Arabic, labelled as Arabic. Content — a perfume's name,
 * a house's story — is written by people, so a translation may simply not
 * exist yet, and the page must say which language it is showing.
 */
export function pick(locale: Locale, ar: string, en: string | null | undefined): Picked {
  if (locale === 'en' && en && en.trim() !== '') return { text: en, lang: 'en' };
  return { text: ar, lang: 'ar' };
}

/**
 * `lang` and `dir` for an element whose text is in `text` on a page in `page`,
 * or nothing when they agree. An Arabic sentence on the English page needs both:
 * `lang` for screen readers and fonts, `dir` so its punctuation lands on the
 * right side.
 */
export function langAttrs(page: Locale, text: Locale): { lang?: Locale; dir?: 'rtl' | 'ltr' } {
  return page === text ? {} : { lang: text, dir: directionOf(text) };
}

/**
 * The language a piece of free text is written in, as far as this site cares:
 * Arabic if it contains Arabic letters, English otherwise. For text nobody
 * labelled — a customer's review is written in whichever language they chose.
 */
export const languageOf = (text: string): Locale => (/[؀-ۿ]/.test(text) ? 'ar' : 'en');
