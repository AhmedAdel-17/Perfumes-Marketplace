import { localeHref } from '@/core/href';
import { sellerText } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { SellerWorkspace } from '@/features/seller/SellerWorkspace';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isListingEditableBySeller } from '@diyar/domain';
import { ListingForm } from '@/features/seller/ListingForm';
import { PhotoManager } from '@/features/seller/PhotoManager';
import { activeSellerSession } from '@/features/seller/actions';
import { api } from '@/core/api';

export async function generateMetadata():Promise<Metadata>{const locale=await getLocale();return {title:sellerText(locale,"Edit product")+' | DIYAR',robots:{index:false,follow:false}};}

export const dynamic = 'force-dynamic';

export default async function SellerListingPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const locale = await getLocale(); const t = (value: string) => sellerText(locale,value);

  const session = await activeSellerSession();
  if (!session) redirect(localeHref(locale,'/seller'));

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
    <SellerWorkspace current="listings" title={listing.name || t("New product")} description={t("Product details, photographs and publication requirements.")}>
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
