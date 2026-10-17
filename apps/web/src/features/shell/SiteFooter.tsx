import { api } from '@/core/api';
import { ThemeToggle } from './ThemeToggle';
import { secondarySurface } from './primary-surface';
import { Monogram } from './Monogram';
import { langAttrs, localePath, pick, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

/**
 * The footer (visual identity v2 — the structure of
 * design-reference/redesign/04-laboratoire.html): a ruled paper band with the
 * mark and the two facts a buyer needs before trusting a price — who ships, and
 * what currency — then three short columns, and the published pages on the
 * ruled line beneath them, where the reference sets its legal links.
 *
 * The editorial pages are read at render. A hardcoded list would be a second
 * place that decides what is published, and it would keep linking a page the
 * day somebody archives it — a footer pointing at a 404 on every screen.
 *
 * The houses directory and contact links are FIXED rather than
 * content-managed: they are sections of the site, not pages somebody publishes,
 * and an editor archiving one by accident would hide every maker, or leave the
 * marketplace with no contact route at all.
 *
 * THE ONE DOOR FOR HOUSES (founder, 17 Oct 2026). The customer site speaks to
 * customers; a perfume house looking for a way in finds it here, in a band at
 * the top of the footer on every page — out of a shopper's way, never out of a
 * house's reach. It replaces a "For houses" column and the home page's
 * verification section and apply box.
 */
export async function SiteFooter() {
  const pages = await api().content.directory();
  const locale = await getLocale();
  const copy = SHELL[locale];
  const to = (path: string) => localePath(locale, path);

  const columns: ReadonlyArray<{ heading: string; links: ReadonlyArray<{ href: string; label: React.ReactNode; key: string }> }> = [
    {
      heading: copy.footerShop,
      links: [
        { key: 'perfumes', href: to('/search'), label: copy.perfumes },
        { key: 'houses', href: to('/houses'), label: copy.houses },
      ],
    },
    {
      heading: copy.footerHelp,
      links: [
        { key: 'track', href: to('/order'), label: copy.trackAnOrder },
        { key: 'contact', href: to('/support'), label: copy.contact },
      ],
    },
  ];

  return (
    <footer className="mt-8 border-t border-ink bg-raised">
      {/* ------------------------------------------- the door for houses */}
      <section aria-labelledby="join" className="border-b border-line">
        <div className="mx-auto flex max-w-contentMax flex-col items-start justify-between gap-5 px-5 py-7 lg:flex-row lg:items-center lg:gap-10 lg:px-8 lg:py-9">
          <div>
            <p className="latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
              {copy.joinKicker.toUpperCase()}
              <span aria-hidden="true" className="h-px w-12 bg-current" />
            </p>
            <h2 id="join" className="font-display text-h3 leading-heading lg:text-h2">{copy.joinTitle}</h2>
            <p className="mt-2 max-w-proseMax text-body leading-relaxed text-ink2 lg:text-bodyLg">{copy.joinBody}</p>
          </div>
          <a href={to('/apply')} className={`${secondarySurface} shrink-0 px-6`}>
            {copy.joinCta}
            <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="rtl:-scale-x-100">
              <path d="M0 5h17M13 1l4 4-4 4" />
            </svg>
          </a>
        </div>
      </section>

      <div className="mx-auto max-w-contentMax px-5 pb-6 pt-8 lg:px-8 lg:pt-[56px]">
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3 text-ink">
              <Monogram size={30} className="text-ink" />
              <span className="wordmark text-h4 leading-none">DIYAR</span>
            </div>
            <p className="mt-4 max-w-proseMax text-body leading-relaxed text-ink2">
              {copy.footerNote}
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-small text-ink3">{column.heading}</h2>
              <ul className="mt-2">
                {column.links.map((link) => (
                  <li key={link.key}>
                    {/* `min-w-touch` as well as min-h: a two-glyph Arabic label
                        like "الدور" is 34px wide, and a target has TWO
                        dimensions — enforcing one of them is enforcing neither. */}
                    <a
                      href={link.href}
                      className="tappable inline-flex min-h-touch min-w-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-3">
          <span className="text-small text-ink3">{copy.copyright}</span>
          {pages.length > 0 && (
            <nav aria-label={copy.footerInformation}>
              <ul className="flex flex-wrap gap-x-4">
                {pages.map((page) => {
                  const title = pick(locale, page.title, page.titleEn);
                  return (
                    <li key={page.slug}>
                      {/* The hit area grows by the same amount on both sides
                          and the label sits centred in it, so the gaps the eye
                          reads stay even. `min-w-touch` alone pads a short
                          label on ONE side, and a row of these looks unevenly set. */}
                      <a
                        href={to(`/${page.slug}`)}
                        className="tappable -mx-2 inline-flex min-h-touch min-w-touch items-center justify-center px-2 text-small text-ink2 transition-colors duration-base ease-out hover:text-accent"
                      >
                        <span {...langAttrs(locale, title.lang)}>{title.text}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
          {/* The masthead carries this from `sm` up. See SiteHeader: one
              instance on screen at any width. */}
          <div className="sm:hidden">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
