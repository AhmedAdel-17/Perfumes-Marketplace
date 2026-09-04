import Link from 'next/link';
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
      'transition-colors duration-base ease-out hover:text-brass',
      active ? 'text-bone' : 'text-faint',
    ].join(' ');

  return (
    <nav className="flex items-center gap-6">
      <Link href="/seller/orders" className={link(current === 'orders')}>الطلبات</Link>
      <Link href="/seller/listings" className={link(current === 'listings')}>المنتجات</Link>
      <Link href="/seller/payouts" className={link(current === 'payouts')}>المستحقّات</Link>
      <form action={signOutSeller}>
        <button
          type="submit"
          // `خروج` is three narrow glyphs — 37px wide, under the floor on the
            // cross axis even with the height fixed. A target has TWO dimensions
            // and only one of them was being enforced.
            className="tappable flex min-h-touch min-w-touch items-center justify-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
        >
          خروج
        </button>
      </form>
    </nav>
  );
}
