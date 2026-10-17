import { localePath, SHELL, type Locale } from '@diyar/i18n';
import { getLocale, getPath } from '@/core/locale';
import { LeaveLink } from './LeaveLink';

/**
 * The language pair — AR | EN — with the current one underlined in the accent.
 *
 * Redesigned 17 Oct 2026 at the founder's request: a lone word ("English")
 * beside a segmented box read as two unrelated, generic controls. Now the
 * language and the appearance are one matched pair of 36px ruled controls.
 *
 * Both codes are always shown, in a fixed order (AR first), so the control
 * never jumps between pages. The accent line sits under the current language;
 * under the pointer it SLIDES to the other — the control shows what it will do
 * before it is pressed. Pure CSS: the line is a `peer` of the link, after it in
 * the DOM, and moves by its logical inset, so it reads correctly in both
 * directions with no direction-specific code.
 *
 * The other language is a plain `<a>`, not `next/link`: the language changes
 * the document's `lang` and `dir`, which live on `<html>` in the root layout,
 * and a client-side navigation keeps that layout as it was. A full page load
 * is the only way the whole document changes direction together — LeaveLink
 * fades the page out first so the load is a change of scene, not a blink.
 *
 * `?lang=` tells middleware this was a CHOICE: it records it in the cookie and
 * lands on the clean URL. Without it, a visitor whose cookie says English would
 * be sent straight back from the Arabic page they just asked for.
 */
const ORDER: readonly Locale[] = ['ar', 'en'];
const CODE: Record<Locale, string> = { ar: 'AR', en: 'EN' };

export async function LanguageSwitch() {
  const locale = await getLocale();
  const target: Locale = locale === 'ar' ? 'en' : 'ar';
  const copy = SHELL[locale];
  const [path = '/', query = ''] = (await getPath()).split('?');
  const params = new URLSearchParams(query);
  params.set('lang', target);
  const href = `${localePath(target, path)}?${params.toString()}`;

  const cell = 'latin flex h-full min-w-touch items-center justify-center px-3 text-caption tracking-label';
  const currentFirst = ORDER.indexOf(locale) === 0;

  return (
    <div
      role="group"
      aria-label={copy.language}
      className="relative grid h-[36px] grid-cols-2 border border-line"
    >
      {ORDER.map((code, index) => {
        const divider = index === 1 ? 'border-s border-line' : '';
        return code === locale ? (
          <span key={code} aria-current="true" className={`${cell} ${divider} text-ink`}>
            <span aria-hidden="true">{CODE[code]}</span>
            <span className="sr-only">{copy.currentLanguage}</span>
          </span>
        ) : (
          <LeaveLink
            key={code}
            href={href}
            hrefLang={target}
            lang={target}
            aria-label={copy.switchLanguageLabel}
            className={[
              `peer tappable ${cell} ${divider} text-ink3`,
              'transition-colors duration-base ease-out hover:text-ink active:opacity-press',
            ].join(' ')}
          >
            {CODE[code]}
          </LeaveLink>
        );
      })}
      {/* The accent line: under the current language, and under the other one
          while the pointer or the focus is on it. */}
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute -bottom-px h-[2px] w-1/2 bg-accent',
          'transition-[inset-inline-start] duration-base ease-out',
          currentFirst
            ? 'start-0 peer-hover:start-1/2 peer-focus-visible:start-1/2'
            : 'start-1/2 peer-hover:start-0 peer-focus-visible:start-0',
        ].join(' ')}
      />
    </div>
  );
}
