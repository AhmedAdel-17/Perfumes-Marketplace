import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrderQueue } from '@/features/seller/OrderQueue';
import { SellerNav } from '@/features/seller/SellerNav';
import { activeSellerSession } from '@/features/seller/actions';

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

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-accent">ORDER QUEUE</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">الطلبات</h1>
        </div>
        <SellerNav current="orders" />
      </header>
      <OrderQueue />
    </main>
  );
}
