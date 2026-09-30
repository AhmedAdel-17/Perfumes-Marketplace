import type { Locale } from './locale';

/**
 * Message catalogues — one per screen, one entry per locale.
 *
 * Pattern — Message Catalogue (a keyed dictionary per locale, chosen at the call
 * site by `catalogue[locale]`). The alternative, a single `t('dot.path')`
 * lookup, loses the compiler: a mistyped key becomes a runtime throw on a page
 * nobody opened in review. Here a missing or extra English key is a type error,
 * because `en` must have exactly the shape of `ar`.
 *
 * Catalogues are per SCREEN rather than one file, so a client component pulls
 * in only the words it renders — on the connections this product is built for,
 * a 40 KB dictionary shipped to every page is a real cost.
 *
 * A message is a string, or a function when it carries a value ("3 perfumes").
 * Functions keep word order in the translator's hands: English and Arabic put
 * the number on different sides of the noun, and string concatenation at the
 * call site would hard-code one of them.
 */
export type Messages<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : Messages<T[K]>;
};

export type Catalogue<T> = Readonly<Record<Locale, Messages<T>>>;

export function defineMessages<const T>(ar: T, en: Messages<T>): Catalogue<T> {
  return { ar: ar as Messages<T>, en };
}
