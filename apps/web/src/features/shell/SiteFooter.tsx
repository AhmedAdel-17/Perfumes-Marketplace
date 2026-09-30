import { api } from '@/core/api';
import { ThemeToggle } from './ThemeToggle';
import { localePath, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';

/**
 * The footer carries the two facts a buyer needs before they trust a price:
 * where the money is denominated, and who is actually shipping. Both come from
 * the founding pack, not from decoration.
 */
export async function SiteFooter() {
  /*
   * The live editorial pages, read at render.
   *
   * A hardcoded list would be a second place that decides what is published,
   * and it would keep linking a page the day somebody archives it — a footer
   * pointing at a 404 on every screen of the site.
   */
  const pages = await api().content.directory();
  const locale = await getLocale();
  const copy = SHELL[locale];
  const to = (path: string) => localePath(locale, path);

  return (
    <footer className="mt-8 border-t border-line">
      <div className="mx-auto max-w-contentMax px-5 py-7 lg:px-8 lg:py-8">
        <div className="latin text-h4 tracking-wordmark text-ink">DIYAR</div>
        <nav className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-1" aria-label={copy.footerNav}>
        <a
          href={to('/order')}
          className="tappable inline-flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {copy.trackAnOrder}
        </a>
        {/* The houses directory. Fixed rather than content-managed: it is a
            section of the site, not a page somebody publishes, and an editor
            archiving it by accident would hide every maker on the marketplace. */}
        <a
          href={to('/houses')}
          // `min-w-touch` as well as min-h. "الدور" is two narrow glyphs — 34px
          // — so the target passed on height and failed on width, which is the
          // same fault the sign-out control had. A target has TWO dimensions
          // and enforcing one of them is enforcing neither.
          className="tappable inline-flex min-h-touch min-w-touch items-center justify-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {copy.houses}
        </a>
        {/*
          A way to reach a person, on every screen.

          Fixed rather than content-managed, for the reason the houses link is:
          it is a section of the site, not a page somebody publishes, and an
          editor archiving it by accident would leave the marketplace with no
          contact route at all.
        */}
        <a
          href={to('/support')}
          className="tappable inline-flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {copy.contact}
        </a>
        {/* The recruiting route. A marketplace of independent houses that has
            no way to become one is a marketplace with a fixed number of
            houses. */}
        <a
          href={to('/apply')}
          className="tappable inline-flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          {copy.apply}
        </a>
        {pages.map((page) => (
          <a
            key={page.slug}
            href={to(`/${page.slug}`)}
            className="tappable inline-flex min-h-touch items-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            {page.title}
          </a>
        ))}
        </nav>
        <p className="mt-5 max-w-proseMax text-body leading-relaxed text-ink3">
          {copy.footerNote}
        </p>

        {/* The masthead carries this from `sm` up, where there is room for it.
            See the note in SiteHeader: one instance at any width. */}
        <div className="mt-6 sm:hidden">
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
