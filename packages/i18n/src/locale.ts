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
