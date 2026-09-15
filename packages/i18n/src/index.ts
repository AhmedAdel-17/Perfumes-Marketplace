/**
 * Copy layer.
 *
 * Arabic-first and RTL-native. `locale` exists so a second locale is a
 * translation job rather than a refactor (D-3 interim position).
 */
export * from './numerals';
export * from './plural';
export * from './governorates';
export * from './states';
export * from './reviews';
export * from './returns';
export * from './support';
export * from './verification';
export * from './catalogue';
export * from './audit';
export { ar, type Dictionary } from './ar';

import { ar, type Dictionary } from './ar';

export type Locale = 'ar';

const DICTIONARIES: Record<Locale, Dictionary> = { ar };

export const DEFAULT_LOCALE: Locale = 'ar';
export const DIRECTION = 'rtl' as const;

export function dictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale];
}

/** Dot-path accessor, so a missing key is a type error rather than a blank screen. */
export function t<K extends string>(path: K, locale: Locale = DEFAULT_LOCALE): string {
  const parts = path.split('.');
  let node: unknown = dictionary(locale);
  for (const p of parts) {
    if (typeof node !== 'object' || node === null || !(p in node)) {
      throw new Error(`Missing copy key: ${path}`);
    }
    node = (node as Record<string, unknown>)[p];
  }
  if (typeof node !== 'string') throw new Error(`Copy key is not a string: ${path}`);
  return node;
}

