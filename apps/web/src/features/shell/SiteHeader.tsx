import Link from 'next/link';
import { BagLink } from '@/features/cart/BagLink';
import { Monogram } from './Monogram';
import { AnnouncementBar } from './AnnouncementBar';
import { ThemeToggle } from './ThemeToggle';
import { MastheadNav } from './MastheadNav';
import { LanguageSwitch } from './LanguageSwitch';
import { SHELL } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

/**
 * The masthead, shared by every public route (visual identity v2 — the
 * structure of design-reference/redesign/04-laboratoire.html, in both themes).
 *
 * Three bands, top to bottom:
 *
 *   1. The announcement, only when one is in window (AnnouncementBar).
 *   2. The top line: how you pay and whether anyone checked — the two questions
 *      a first-time buyer has before any other. It scrolls away with the page;
 *      a visitor who has read it once does not need it following them.
 *   3. The bar itself, sticky: the mark, the three places people go, and the
 *      preferences (language, appearance) and the bag.
 *
 * The bar is SOLID ground with a full-strength rule beneath it, not the
 * translucent blur of the first identity: Laboratoire is a printed register,
 * and a register's head is ruled, not frosted.
 *
 * Law I still governs what is here. Every link leads somewhere real; nothing is
 * added for a route that does not exist yet (a notes index, a "how we verify"
 * page), because a control that does nothing teaches the visitor the interface
 * lies.
 */
export async function SiteHeader() {
  const locale = await getLocale();
  const copy = SHELL[locale];
  return (
    <>
      <AnnouncementBar />

      <div className="border-b border-line text-caption text-ink2 lg:text-small">
        <div className="mx-auto flex min-h-[34px] max-w-contentMax items-center justify-between gap-4 px-5 lg:px-8">
          <span>{copy.codNote}</span>
          {/* Below `sm` the line holds one fact; the payment one is the one a
              buyer cannot find anywhere else before checkout. */}
          <span className="hidden sm:inline">{copy.verifiedNote}</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-ink bg-ground">
        {/*
          ONE row from `lg`; below it, the links wrap to a second row of their
          own. A single set of links in the DOM at every width, placed by
          `order` rather than rendered twice and hidden once — two copies is two
          things to keep in step, and a screen reader that finds both hears the
          navigation twice.
        */}
        <div className="mx-auto flex max-w-contentMax flex-wrap items-center px-5 lg:h-[76px] lg:flex-nowrap lg:px-8">
          <Link
            href={localeHref(locale, '/')}
            aria-label={copy.homeLabel}
            className="tappable group flex h-[58px] items-center gap-3 text-ink transition-opacity duration-base ease-out hover:opacity-press lg:h-auto"
          >
            <Monogram
              size={30}
              className="text-ink transition-colors duration-slow ease-out group-hover:text-accent lg:h-[36px] lg:w-[36px]"
            />
            <span className="flex flex-col">
              <span className="wordmark text-h4 leading-none lg:text-h3Lg">DIYAR</span>
              {/* The descriptor the doctrine asks for in commercial contexts:
                  the name alone does not say "fragrance". Latin in both
                  languages, like the wordmark it qualifies. */}
              <span lang="en" className="latin mt-1 hidden text-micro tracking-label text-ink3 lg:block">
                {copy.descriptor}
              </span>
            </span>
          </Link>

          <MastheadNav className="order-last w-full border-t border-line lg:order-none lg:ms-14 lg:w-auto lg:border-0" />

          <div className="ms-auto flex items-center gap-4 lg:gap-6">
            <LanguageSwitch />
            {/*
              From `sm` only; the footer carries it below that. At 360px the row
              already holds the mark, the wordmark, the language and the bag, and
              appearance is a PREFERENCE, not navigation — on a phone it goes
              where preferences belong. One instance on screen at any width.
            */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <BagLink />
          </div>
        </div>
      </header>
    </>
  );
}
