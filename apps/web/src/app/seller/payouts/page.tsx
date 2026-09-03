import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SellerPayouts } from '@/features/seller/Payouts';
import { SellerNav } from '@/features/seller/SellerNav';
import { activeSellerSession } from '@/features/seller/actions';

export const metadata: Metadata = {
  title: 'المستحقّات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerPayoutsPage() {
  if (!(await activeSellerSession())) redirect('/seller');

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 px-5 pb-7 pt-9 lg:px-0">
        <div>
          <div className="latin mb-3 text-micro tracking-label text-brass">PAYOUTS</div>
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">المستحقّات</h1>
        </div>
        <SellerNav current="payouts" />
      </header>
      <SellerPayouts />
    </main>
  );
}
