'use client';

import Link from 'next/link';
import { data as num, PRODUCT, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useCart } from './CartStore';

/**
 * "In your bag", under a perfume's own buy button (identity v3, 16 Nov 2026).
 *
 * The drop flies to the masthead's bag and the count rises there — at the top
 * of the page, while the visitor's eyes are on the button. What was missing
 * was the NEXT step where the eye already is: once this perfume is in the bag,
 * a quiet line under the button says so and offers the way on. It is not a
 * toast (DESIGN_DOCTRINE §3), it does not move the layout above it, and it
 * reads the bag itself — so it is also true on a return visit.
 *
 * Nothing is rendered before hydration: the server cannot know the bag.
 */
export function InBag({ productId, locale }: { productId: string; locale: Locale }) {
  const { entries, hydrated } = useCart();
  const copy = PRODUCT[locale];
  const line = entries.find((e) => e.productId === productId);
  if (!hydrated || !line) return <div aria-hidden="true" className="h-touch" />;
  return (
    <p className="fade-in flex min-h-touch items-center justify-between gap-4 text-small text-ink2 lg:text-body" aria-live="polite">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="h-1.5 w-1.5 bg-accent" />
        {copy.inYourBag(num(line.quantity))}
      </span>
      <Link
        href={localeHref(locale, '/cart')}
        className="tappable inline-flex min-h-touch items-center text-ink transition-colors duration-base ease-out hover:text-accent"
      >
        <span className="link-line">{copy.viewBag}</span>
      </Link>
    </p>
  );
}
