import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ListingList } from '@/features/seller/ListingList';
import { SellerNav } from '@/features/seller/SellerNav';
import { activeSellerSession } from '@/features/seller/actions';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'المنتجات | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerListingsPage() {
  const session = await activeSellerSession();
  if (!session) redirect('/seller');

  const caller = api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId);
  const [listings, brand] = await Promise.all([
    caller.listings.mine(),
    caller.listings.myBrand(),
  ]);

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-contentMax lg:px-8">
      <SellerNav current="listings" />
      <h1 className="px-5 pb-6 pt-7 font-display text-h1 leading-heading lg:px-0 lg:pt-9 lg:text-h1Lg">
        المنتجات
      </h1>
      <ListingList listings={listings} brandId={brand?.id ?? null} />
    </main>
  );
}
