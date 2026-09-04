import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ListingForm } from '@/features/seller/ListingForm';
import { activeSellerSession } from '@/features/seller/actions';
import { api } from '@/core/api';

export const metadata: Metadata = {
  title: 'تحرير منتج | ديار',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerListingPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await activeSellerSession();
  if (!session) redirect('/seller');

  const { id } = await params;
  const listing = await api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId)
    .listings.get({ id })
    .catch(() => null);

  // Not found and not-yours are the same response on purpose: a different one
  // would tell a house which listing ids belong to somebody else.
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-phoneMax pb-9 lg:max-w-[760px] lg:px-8">
      <header className="px-5 pb-6 pt-9 lg:px-0">
        <a
          href="/seller/listings"
          className="tappable mb-4 flex min-h-touch items-center text-caption tracking-label text-faint transition-colors duration-base ease-out hover:text-brass"
        >
          ← كل المنتجات
        </a>
        <h1 className="font-display text-h2 leading-heading lg:text-h1Lg">
          {listing.name || 'منتج جديد'}
        </h1>
      </header>
      <ListingForm
        listing={{
          ...listing,
          canMoveTo: [...listing.canMoveTo],
          gaps: [...listing.gaps],
          claims: [...listing.claims],
        }}
      />
    </main>
  );
}
