'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from './CartStore';
import { data as num, SHELL } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from '@/features/shell/LocaleProvider';

/**
 * The bag, in the masthead.
 *
 * It appears only when there is something in it. A permanently visible empty
 * bag icon is the default every storefront ships, and it spends most of a
 * visitor's session saying nothing — DESIGN_DOCTRINE law I. When it does
 * appear it carries the count, because that is the only thing it needs to say.
 *
 * Nothing renders before hydration: the server cannot know what is in this
 * visitor's basket, so a count rendered during SSR would be wrong and would
 * then flicker to the right value.
 *
 * THE SPRITZ (17 Oct 2026): when the count GROWS, a little mist leaves the
 * count — the flacon loader's "done", on the bag. Only on growth, never on the
 * first render of a page (the masthead remounts on every navigation, and a bag
 * that already held three bottles has not just been given one).
 */
/** The bag's mist: a small fan of droplets, away from the count. */
const SPRITZ: ReadonlyArray<readonly [number, number]> = [[10, -8], [14, -2], [12, 5], [18, -5], [17, 3], [8, -1], [21, 0]];

export function BagLink() {
  const { itemCount, hydrated } = useCart();
  const locale = useLocale();
  const copy = SHELL[locale];
  const seen = useRef<number | null>(null);
  const [spritz, setSpritz] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (seen.current !== null && itemCount > seen.current) setSpritz((n) => n + 1);
    seen.current = itemCount;
  }, [hydrated, itemCount]);

  if (!hydrated || itemCount === 0) return null;

  return (
    <Link
      href={localeHref(locale, '/cart')}
      // The label plus its badge is a 22px line box; `tappable` alone adds 16
      // and still lands under the floor. min-h-touch is the honest fix — the
      // TARGET is 44, while the visible label stays small.
      className="tappable flex min-h-touch items-center gap-2 text-body text-ink transition-colors duration-base ease-out hover:text-accent"
      aria-label={copy.bagLabel(num(itemCount))}
    >
      <span>{copy.bag}</span>
      {/* A square count, like every other edge in the identity. */}
      <span className="tnum latin relative flex h-[22px] min-w-[22px] items-center justify-center bg-accent-surface px-1.5 text-caption text-on-accent">
        {num(itemCount)}
        {spritz > 0 && (
          // Keyed by the count of spritzes, so each addition plays it afresh.
          <span key={spritz} aria-hidden="true" className="bag-spritz">
            {SPRITZ.map(([dx, dy], i) => (
              <i key={i} style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${i * 25}ms` }} />
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
