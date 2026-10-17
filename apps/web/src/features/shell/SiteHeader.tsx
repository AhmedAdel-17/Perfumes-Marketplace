import Link from 'next/link';
import { BagLink } from '@/features/cart/BagLink';
import { Monogram } from './Monogram';
import { AnnouncementBar } from './AnnouncementBar';
import { ThemeToggle } from './ThemeToggle';
import { MastheadNav } from './MastheadNav';
import { LanguageSwitch } from './LanguageSwitch';
import { MastheadSentinel } from './MastheadSentinel';
import { PerfumesPanel } from './PerfumesPanel';
import { SHELL } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

/**
 * The masthead, shared by every public route (visual identity v2 — the
 * structure of design-reference/redesign/04-laboratoire.html, in both themes).
 *
 * Two bands, top to bottom:
 *
 *   1. The announcement, only when one is in window (AnnouncementBar).
 *   2. The bar itself, sticky: the mark, the three places people go, and the
 *      preferences (language, appearance) and the bag.
 *
 * (A top line with the payment and verification facts sat between them until
 * 17 Oct 2026; the founder removed it. Both facts are still said where they
 * matter — at checkout and on the verification standard.)
 *
 * "ATOMISEUR" — header concept 02 of three fragrance-led samples
 * (design-reference/redesign/header/), chosen by the founder 17 Oct 2026. The
 * spray: on a visit's first arrival the wordmark condenses out of a mist,
 * letter by letter, as a spritz settles; links bloom a cloud of the accent
 * under the pointer; Perfumes opens the rack of scent-family vials
 * (PerfumesPanel). From `lg` the bar is three columns — the house at the
 * start, the ways in at the centre, the preferences at the end.
 *
 * The bar is SOLID ground with a full-strength rule beneath it: a register's
 * head is ruled, not frosted. It SETTLES as the page scrolls under it, from
 * 84px to 62px with the descriptor faded away; MastheadSentinel marks the
 * moment with `data-scrolled` on <html>, everything else is these classes.
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

      <MastheadSentinel />
      <header className="sticky top-0 z-40 border-b border-ink bg-ground">
        {/*
          ONE row from `lg`; below it, the links wrap to a second row of their
          own. A single set of links in the DOM at every width, placed by
          `order` rather than rendered twice and hidden once — two copies is two
          things to keep in step, and a screen reader that finds both hears the
          navigation twice.
        */}
        <div className="mx-auto flex max-w-contentMax flex-wrap items-center px-5 transition-[height] duration-slow ease-out lg:grid lg:h-[84px] lg:grid-cols-[1fr_auto_1fr] lg:px-8 lg:[html[data-scrolled]_&]:h-[62px]">
          <Link
            href={localeHref(locale, '/')}
            aria-label={copy.homeLabel}
            className="mast-mark tappable group flex h-[58px] items-center gap-3 text-ink lg:h-auto lg:justify-self-start"
          >
            <Monogram
              size={30}
              className="text-ink transition-[color,width,height] duration-slow ease-out group-hover:text-accent lg:h-[36px] lg:w-[36px] lg:[html[data-scrolled]_&]:h-[30px] lg:[html[data-scrolled]_&]:w-[30px]"
            />
            <span className="flex flex-col">
              {/* Letter by letter, so each can condense out of the mist on
                  its own beat (globals.css, `.mast-letter`). */}
              <span className="wordmark text-h4 leading-none lg:text-h3Lg">
                {'DIYAR'.split('').map((letter, index) => (
                  <span key={index} className="mast-letter">{letter}</span>
                ))}
              </span>
              {/* The descriptor the doctrine asks for in commercial contexts:
                  the name alone does not say "fragrance". Latin in both
                  languages, like the wordmark it qualifies. */}
              <span
                lang="en"
                className={[
                  'latin mt-1 hidden max-h-[16px] overflow-hidden text-micro tracking-label text-ink3 lg:block',
                  'transition-[opacity,max-height,margin] duration-base ease-out',
                  '[html[data-scrolled]_&]:mt-0 [html[data-scrolled]_&]:max-h-0 [html[data-scrolled]_&]:opacity-0',
                ].join(' ')}
              >
                {copy.descriptor}
              </span>
            </span>
          </Link>

          <MastheadNav
            className="order-last w-full border-t border-line lg:order-none lg:h-full lg:w-auto lg:self-stretch lg:border-0"
            panel={<PerfumesPanel locale={locale} />}
          />

          <div className="ms-auto flex items-center gap-3 lg:justify-self-end">
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
