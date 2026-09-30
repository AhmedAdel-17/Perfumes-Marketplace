import { localePath, SHELL, type Locale } from '@diyar/i18n';
import { getLocale, getPath } from '@/core/locale';

/**
 * The other language, for this same page.
 *
 * A plain `<a>`, not `next/link`: the language changes the document's `lang`
 * and `dir`, which live on `<html>` in the root layout, and a client-side
 * navigation keeps that layout as it was. A full page load is the only way the
 * whole document changes direction together.
 *
 * `?lang=` tells middleware this was a CHOICE: it records it in the cookie and
 * lands on the clean URL. Without it, a visitor whose cookie says English would
 * be sent straight back from the Arabic page they just asked for.
 */
export async function LanguageSwitch() {
  const locale = await getLocale();
  const target: Locale = locale === 'ar' ? 'en' : 'ar';
  const copy = SHELL[locale];

  const [path = '/', query = ''] = (await getPath()).split('?');
  const params = new URLSearchParams(query);
  params.set('lang', target);

  return (
    <a
      href={`${localePath(target, path)}?${params.toString()}`}
      hrefLang={target}
      lang={target}
      aria-label={copy.switchLanguageLabel}
      className="flex min-h-touch min-w-touch items-center justify-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent active:opacity-press"
    >
      {copy.switchLanguage}
    </a>
  );
}
