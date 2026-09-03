import Link from 'next/link';
import { BagLink } from '@/features/cart/BagLink';
import { Monogram } from './Monogram';

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
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hair/60 bg-noir/[.72] backdrop-blur-xl">
      <div className="mx-auto flex h-[58px] max-w-contentMax items-center justify-between px-5 lg:h-[82px] lg:px-8">
        <Link
          href="/"
          aria-label="ديار — الصفحة الرئيسية"
          // The wordmark alone renders a 35px line box, under the 44pt floor;
          // `tappable` expands the hit area without touching the type.
          className="tappable group flex items-center gap-3 text-bone transition-opacity duration-base ease-out hover:opacity-press lg:gap-4"
        >
          <Monogram
            size={26}
            className="text-brass transition-colors duration-slow ease-out group-hover:text-bone lg:h-[32px] lg:w-[32px]"
          />
          <span className="latin text-h4 tracking-wordmark lg:text-h3Lg">DIYAR</span>
        </Link>

        <div className="flex items-center gap-6">
          {/* The one piece of orientation a first-time visitor needs. It gives
              way to the bag on a phone, where there is room for one of them. */}
          <span className="hidden text-caption tracking-label text-faint md:block">
            دور العطور المصرية
          </span>
          <BagLink />
        </div>
      </div>
    </header>
  );
}
