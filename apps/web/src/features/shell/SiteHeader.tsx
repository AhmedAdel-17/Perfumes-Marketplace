import Link from 'next/link';
import { BagLink } from '@/features/cart/BagLink';
import { Monogram } from './Monogram';
import { AnnouncementBar } from './AnnouncementBar';
import { ThemeToggle } from './ThemeToggle';

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
      <div className="mx-auto flex h-[58px] max-w-contentMax items-center justify-between px-5 lg:h-[82px] lg:px-8">
        {/*
          DESIGN_DOCTRINE law I is subtraction, and the note below says links
          appear here as they become real. Search is now real: the route exists,
          it works without JavaScript, and it is the control a customer reaches
          for once a catalogue stops fitting on one screen.
        */}
        <Link
          href="/"
          aria-label="ديار — الصفحة الرئيسية"
          // The wordmark alone renders a 35px line box, under the 44pt floor;
          // `tappable` expands the hit area without touching the type.
          className="tappable group flex items-center gap-3 text-ink transition-opacity duration-base ease-out hover:opacity-press lg:gap-4"
        >
          <Monogram
            size={26}
            className="text-accent transition-colors duration-slow ease-out group-hover:text-ink lg:h-[32px] lg:w-[32px]"
          />
          <span className="latin text-h4 tracking-wordmark lg:text-h3Lg">DIYAR</span>
        </Link>

        <div className="flex items-center gap-4 lg:gap-6">
          {/* The one piece of orientation a first-time visitor needs. It gives
              way to the bag on a phone, where there is room for one of them. */}
          <span className="hidden text-caption tracking-label text-ink3 lg:block">
            دور العطور المصرية
          </span>
          {/*
            The route existed and nothing pointed at it, which is the same as
            not having built it. A search screen a customer cannot reach is a
            URL, not a feature.

            A LINK rather than an expanding search field: a field in the
            masthead costs the row width it needs on every screen and every
            page, and the screen it leads to has a better one. Law I is
            subtraction.
          */}
          <Link
            href="/search"
            className="tappable flex min-h-touch min-w-touch items-center justify-center text-caption tracking-label text-ink3 transition-colors duration-base ease-out hover:text-accent"
          >
            ابحث
          </Link>
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
