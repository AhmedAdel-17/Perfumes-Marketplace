import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isListingEditableBySeller } from '@diyar/domain';
import { ListingForm } from '@/features/seller/ListingForm';
import { PhotoManager } from '@/features/seller/PhotoManager';
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
  const house = api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId);
  // Both at once: they are independent reads, and the photographs are what a
  // house most often came to this page to change.
  const [listing, photos] = await Promise.all([
    house.listings.get({ id }).catch(() => null),
    house.photos.list({ productId: id }).catch(() => null),
  ]);

  // Not found and not-yours are the same response on purpose: a different one
  // would tell a house which listing ids belong to somebody else.
  if (!listing || !photos) notFound();

  /*
    760px was the phone column with margins — a working tool rendered at just
    over half the monitor it is used on, with every row stretched to reach both
    of its edges. The console gets the content measure, and the lists inside it
    get columns so the extra width becomes room rather than distance.
    DESIGN_DOCTRINE §4b.
  */
  return (
    <SellerWorkspace current="listings" title={listing.name || 'منتج جديد'} description="بيانات المنتج وصوره وقواعد النشر.">
      <PhotoManager
        productId={listing.id}
        photos={photos.map((photo) => ({ ...photo }))}
        readOnly={!isListingEditableBySeller(listing.state)}
      />
      <ListingForm
        listing={{
          ...listing,
          canMoveTo: [...listing.canMoveTo],
          gaps: [...listing.gaps],
          claims: [...listing.claims],
        }}
      />
    </SellerWorkspace>
  );
}
