import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrderQueue } from '@/features/seller/OrderQueue';
import { activeSellerSession, signOutSeller } from '@/features/seller/actions';

export const metadata: Metadata = {
  title: 'الطلبات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerOrdersPage() {
  // The same revocation-aware check the actions use. Reading the cookie alone
  // here would render the portal for someone whose access was withdrawn and
  // simply show them nothing in it.
  if (!(await activeSellerSession())) redirect('/seller');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="flex items-baseline justify-between px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-brass">ORDER QUEUE</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الطلبات</h1>
        </div>
        <form action={signOutSeller}>
          <button
            type="submit"
            className="tappable flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
          >
            خروج
          </button>
        </form>
      </header>
      <OrderQueue />
    </main>
  );
}
