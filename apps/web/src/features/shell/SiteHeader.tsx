import Link from 'next/link';

/**
 * The masthead, shared by every public route.
 *
 * DESIGN_DOCTRINE.md law I is subtraction, and a masthead is where that law is
 * tested hardest: every marketplace wants to put a search box, a bag, a wishlist
 * and an account menu here on day one. None of those routes exist yet, and a
 * control that does nothing is worse than an empty header — it teaches the
 * visitor that the interface lies. Links appear here as they become real.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hair bg-noir/[.88] backdrop-blur-md">
      <div className="mx-auto flex h-[56px] max-w-contentMax items-center justify-between px-5 lg:h-[76px] lg:px-8">
        <Link
          href="/"
          // The wordmark renders at 19px, which is a 35px line box — under the 44pt
          // floor. `tappable` expands the hit area without touching the type.
          className="tappable latin text-h4 tracking-wordmark text-bone transition-opacity duration-instant ease-out hover:opacity-press lg:text-h3"
        >
          DIYAR
        </Link>

        {/* The one piece of orientation a first-time visitor needs: what this is. */}
        <span className="hidden text-caption tracking-label text-faint md:block">
          دور العطور المصرية
        </span>
      </div>
    </header>
  );
}
