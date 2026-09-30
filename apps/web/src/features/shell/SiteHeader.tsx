import Link from 'next/link';
import { BagLink } from '@/features/cart/BagLink';
import { Monogram } from './Monogram';
import { AnnouncementBar } from './AnnouncementBar';
import { ThemeToggle } from './ThemeToggle';
import { MastheadNav } from './MastheadNav';

/**
 * The masthead, shared by every public route.
 *
 * DESIGN_DOCTRINE.md law I is subtraction, and a masthead is where that law is
 * tested hardest: every marketplace wants a search box, a bag, a wishlist and an
 * account menu here on day one. None of those routes exist yet, and a control
 * that does nothing is worse than an empty header — it teaches the visitor that
 * the interface lies. Links appear here as they become real.
 *
 * The bar is translucent rather than solid so the opening image is never boxed
 * in by a strip of flat colour; the blur is what separates it from the content
 * running underneath.
 */
export async function SiteHeader() {
  return (
    <>
    {/*
      The notice sits ABOVE the sticky bar and scrolls away with the page.

      Sticking it too would cost 40px of every screen forever to something
      that is only news for a day, and a visitor who has read it once does not
      need it following them down the page.

      It lives here rather than in each route so it cannot be forgotten on the
      one page where it mattered — every public surface renders this masthead.
    */}
    <AnnouncementBar />
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ground/[.72] backdrop-blur-xl">
      {/*
        ONE row from `lg`; below it, the links wrap to a second row of their own.

        A single set of links in the DOM at every width, placed by `order`
        rather than rendered twice and hidden once — two copies is two things
        to keep in step, and a screen reader that finds both hears the
        navigation twice.
      */}
      <div className="mx-auto flex max-w-contentMax flex-wrap items-center px-5 lg:h-[82px] lg:flex-nowrap lg:px-8">
        <Link
          href="/"
          aria-label="ديار — الصفحة الرئيسية"
          // The wordmark alone renders a 35px line box, under the 44pt floor;
          // `tappable` expands the hit area without touching the type.
          className="tappable group flex h-[58px] items-center gap-3 text-ink transition-opacity duration-base ease-out hover:opacity-press lg:h-auto lg:gap-4"
        >
          <Monogram
            size={26}
            className="text-accent transition-colors duration-slow ease-out group-hover:text-ink lg:h-[32px] lg:w-[32px]"
          />
          <span className="latin text-h4 tracking-wordmark lg:text-h3Lg">DIYAR</span>
        </Link>

        {/*
          No tagline beside the links: small grey text next to real links reads
          as a link that does nothing.
        */}
        <MastheadNav className="order-last w-full border-t border-line/40 lg:order-none lg:ms-14 lg:w-auto lg:border-0" />

        <div className="ms-auto flex items-center gap-4 lg:gap-6">
          {/*
            From `sm` only, and the footer carries it below that.

            At 360px with a full bag the masthead holds four things — mark,
            wordmark, appearance, bag — and they came to 374px inside a 360px
            screen: a page that scrolls sideways on the smallest phone still in
            use. Shaving gaps to make it fit would have left the row with no
            slack at all, and the row grows every time anything is added to it.

            Appearance is a PREFERENCE, not navigation, so on a phone it goes
            where preferences belong. One instance is on screen at any width;
            neither is a duplicate of the other.
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
