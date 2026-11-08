import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from './in-memory-repositories';

describe('listing stock compare-and-set reference', () => {
  it('keeps stale stock and metadata out while allowing current-CAS and metadata-only saves', async () => {
    const uow = new InMemoryUnitOfWork();
    const sellerId = 'seller';
    const listing = await uow.transaction(r => r.listings.create(sellerId, { name: 'Original', slug: 'stock-cas', sku: 'CAS', brandId: 'brand' }));
    await uow.transaction(r => r.listings.update(listing.id, sellerId, { stock: 5 }, 0));
    await uow.transaction(r => r.inventory.adjust({ productId: listing.id, expectedOnHand: 5, delta: -2,
      reason: 'count_correction', requestId: 'stock-changed', occurredAt: new Date('2026-11-08T12:00:00Z') }));
    await expect(uow.transaction(r => r.listings.update(listing.id, sellerId, { name: 'Stale', stock: 5 }, 5))).rejects.toMatchObject({ code: 'LISTING_STOCK_CONFLICT' });
    await expect(uow.transaction(r => r.listings.update(listing.id, sellerId, { stock: 5 }))).rejects.toMatchObject({ code: 'LISTING_STOCK_CONFLICT' });
    expect(await uow.transaction(r => r.listings.findForSeller(listing.id, sellerId))).toMatchObject({ name: 'Original', stock: 3 });
    await uow.transaction(r => r.listings.update(listing.id, sellerId, { name: 'Metadata', stock: 3 }));
    await uow.transaction(r => r.listings.update(listing.id, sellerId, { stock: 4 }, 3));
    expect(await uow.transaction(r => r.inventory.summary(listing.id))).toMatchObject({ onHand: 4 });
  });
});
