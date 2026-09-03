import Link from 'next/link';
import { signOutSeller } from './actions';

/**
 * The portal's own chrome.
 *
 * Two destinations and a way out. A house does two things here — work the queue
 * and check what it is owed — and a navigation offering more than a house
 * actually does is a navigation it has to read past every time.
 */
export function SellerNav({ current }: { current: 'orders' | 'payouts' }) {
  const link = (active: boolean) =>
    [
      'tappable flex min-h-touch items-center text-caption tracking-label',
      'transition-colors duration-base ease-out hover:text-brass',
      active ? 'text-bone' : 'text-faint',
    ].join(' ');

  return (
    <nav className="flex items-center gap-6">
      <Link href="/seller/orders" className={link(current === 'orders')}>الطلبات</Link>
      <Link href="/seller/payouts" className={link(current === 'payouts')}>المستحقّات</Link>
      <form action={signOutSeller}>
        <button
          type="submit"
          className="tappable flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
        >
          خروج
        </button>
      </form>
    </nav>
  );
}
