import type { Locale } from '@diyar/i18n';

/**
 * A message from the API, for a visitor in `locale`.
 *
 * The routers still write their refusals in Arabic (P5.6.2 step 6 moves them to
 * codes the storefront words). Until then an English visitor gets the screen's
 * own English sentence rather than Arabic inside an English page. Delete this
 * function when step 6 lands: every caller will then pass the worded message.
 */
export function apiMessage(message: string, locale: Locale, fallback: string, max = 300): string {
  if (locale === 'en') return fallback;
  return message.length > 0 && message.length < max ? message : fallback;
}
