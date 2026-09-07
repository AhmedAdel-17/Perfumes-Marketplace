import Link from 'next/link';
import { ThemeToggle } from '@/features/shell/ThemeToggle';
import { signOutSeller } from './actions';

/**
 * The portal's own chrome.
 *
 * Three destinations and a way out. A house does three things here — works the
 * queue, writes its listings, and checks what it is owed. Nothing more goes in
 * here: a navigation offering more than a house actually does is one it has to
 * read past every time.
 */
export function SellerNav({ current }: { current: 'orders' | 'listings' | 'payouts' }) {
  const link = (active: boolean) =>
    [
      'tappable flex min-h-touch items-center text-caption tracking-label',
      'transition-colors duration-base ease-out hover:text-accent',
      active ? 'text-ink' : 'text-ink3',
    ].join(' ');

  return (
    <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Link href="/seller/orders" className={link(current === 'orders')}>الطلبات</Link>
      <Link href="/seller/listings" className={link(current === 'listings')}>المنتجات</Link>
      <Link href="/seller/payouts" className={link(current === 'payouts')}>المستحقّات</Link>

      {/* The portal has no site footer, so appearance lives here. A house works
          these screens for hours; which way they are lit is not cosmetic. */}
      <ThemeToggle />

      <form action={signOutSeller}>
        <button
          type="submit"
          // `خروج` is three narrow glyphs — 37px wide, under the floor on the
            // cross axis even with the height fixed. A target has TWO dimensions
            // and only one of them was being enforced.
            className="tappable flex min-h-touch min-w-touch items-center justify-center text-caption tracking-label text-ink3 transition-colors duration-base ease-out hover:text-accent"
        >
          خروج
        </button>
      </form>
    </nav>
  );
}
