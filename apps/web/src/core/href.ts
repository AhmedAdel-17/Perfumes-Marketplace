import type { Route } from 'next';
import { localePath, type Locale } from '@diyar/i18n';

/**
 * A typed route, in a language.
 *
 * The INPUT is checked against the app's real routes like any `href`; the
 * output is not, because `/en/...` is a middleware rewrite that typed routes
 * cannot see. The cast is sound for exactly that reason: `localePath` only ever
 * prefixes a route that already type-checked.
 */
export function localeHref<T extends string>(locale: Locale, path: Route<T>): Route {
  return localePath(locale, path) as Route;
}
