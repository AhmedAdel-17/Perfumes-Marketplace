'use client';

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
 */
export function BagLink() {
  const { itemCount, hydrated } = useCart();
  const locale = useLocale();
  const copy = SHELL[locale];
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
      <span className="tnum flex h-[22px] min-w-[22px] items-center justify-center rounded-pill bg-accent-surface px-1.5 text-micro font-semibold text-on-accent">
        {num(itemCount)}
      </span>
    </Link>
  );
}
