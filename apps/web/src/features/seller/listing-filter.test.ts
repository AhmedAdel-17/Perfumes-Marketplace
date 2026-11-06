import { describe, expect, it } from 'vitest';
import { filterListings } from './listing-filter';
import type { ListingRow } from './ListingList';

const row = (id: string, values: Partial<ListingRow> = {}): ListingRow => ({
  id, name: 'ليل القاهرة', slug: 'layl-al-qahira', sku: 'NOUR-01', state: 'published',
  primaryPhoto: null, priceRecorded: true, stockRecorded: true,
  stock: 4, pricePiastres: 85000, moderationReason: null, ...values,
});
const rows = [
  row('live'), row('empty', { stock: 0 }), row('draft', { state: 'draft', stock: 0 }),
  row('returned', { state: 'draft', moderationReason: 'missing_required_fields' }),
  row('suspended', { state: 'suspended', moderationReason: 'misleading_media' }),
  row('unknown-stock', { stock: 0, stockRecorded: false }),
];

describe('seller catalogue filters', () => {
  it('searches Arabic names and case-insensitive public paths without mutating input', () => {
    expect(filterListings(rows, '  LAYL-AL  ', 'all')).toEqual(rows);
    expect(filterListings(rows, 'القاهرة', 'all')).toEqual(rows);
    expect(filterListings(rows, 'nour-01', 'all')).toEqual(rows);
    expect(rows.map((item) => item.id)).toEqual(['live', 'empty', 'draft', 'returned', 'suspended', 'unknown-stock']);
  });
  it('only counts published zero-stock listings as out of stock', () => {
    expect(filterListings(rows, '', 'out_of_stock').map((item) => item.id)).toEqual(['empty']);
  });
  it('distinguishes returned drafts from untouched drafts and suspended listings', () => {
    expect(filterListings(rows, '', 'needs_changes').map((item) => item.id)).toEqual(['returned']);
  });
  it('combines state and search and returns a genuine empty result', () => {
    expect(filterListings(rows, 'rose', 'draft')).toEqual([]);
    expect(filterListings(rows, '', 'draft').map((item) => item.id)).toEqual(['draft', 'returned']);
  });
});
