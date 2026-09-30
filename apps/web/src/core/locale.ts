import 'server-only';
import { headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from '@diyar/i18n';

/**
 * The language of the page being rendered, as middleware decided it from the
 * URL. Middleware overwrites `x-locale` on every request, so a client cannot
 * choose it by sending the header.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get('x-locale');
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The path being rendered, without its language prefix, with its query. */
export async function getPath(): Promise<string> {
  return (await headers()).get('x-path') ?? '/';
}

/** A link to an internal path, in the language of the page being rendered. */
export async function linkTo(path: string): Promise<string> {
  return localePath(await getLocale(), path);
}
