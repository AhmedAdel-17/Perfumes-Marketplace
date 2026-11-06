/**
 * Pattern — presentation selector. Filters never change listing state or stock;
 * all results are taken from the current seller-scoped catalogue response.
 */
import type { ListingState, ModerationReason } from '@diyar/domain';

export type ListingFilter = ListingState | 'all' | 'needs_changes' | 'out_of_stock';
interface SearchableListing {
  readonly name: string;
  readonly slug: string;
  readonly sku: string;
  readonly stockRecorded: boolean;
  readonly state: ListingState;
  readonly stock: number;
  readonly moderationReason: ModerationReason | null;
}

export function filterListings<T extends SearchableListing>(
  listings: readonly T[], query: string, filter: ListingFilter,
): T[] {
  const search = query.trim().normalize('NFKC').toLocaleLowerCase('ar');
  return listings.filter((listing) => {
    const matchesState = filter === 'all'
      || (filter === 'needs_changes' ? listing.state === 'draft' && listing.moderationReason !== null
        : filter === 'out_of_stock' ? listing.state === 'published' && listing.stockRecorded && listing.stock === 0
          : listing.state === filter);
    return matchesState && (!search
      || `${listing.name}\n${listing.sku}\n${listing.slug}`.normalize('NFKC').toLocaleLowerCase('ar').includes(search));
  });
}
