import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SellerPayouts } from '@/features/seller/Payouts';
import { SellerNav } from '@/features/seller/SellerNav';
import { ConsoleHead } from '@/features/shell/ConsoleHead';
import { activeSellerSession } from '@/features/seller/actions';

export const metadata: Metadata = {
  title: 'المستحقّات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerPayoutsPage() {
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
      <ConsoleHead kicker="Payouts" title="المستحقّات" nav={<SellerNav current="payouts" />} />
      <SellerPayouts />
    </main>
  );
}
