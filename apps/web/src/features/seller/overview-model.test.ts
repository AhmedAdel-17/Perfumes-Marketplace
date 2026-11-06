import { describe, expect, it } from 'vitest';
import { buildSellerOverview, buildOverviewPeriod, type OverviewOrder } from './overview-model';
const now = new Date('2026-11-06T12:00:00Z');
const order = (id: string, state: string, confirmDueAt: string | null = null, dispatchDueAt: string | null = null): OverviewOrder => ({ id, reference: id, state, placedAt: '2026-11-05T12:00:00Z', confirmDueAt, dispatchDueAt });
describe('seller overview facts', () => {
  it('keeps terminal orders out of the action count and SLA breaches', () => {
    const result = buildSellerOverview([order('1', 'delivered', '2020-01-01'), order('2', 'cancelled', '2020-01-01'), order('3', 'awaiting_seller', '2026-11-06T11:00:00Z')], [], [], now);
    expect(result.awaiting).toBe(1); expect(result.delivered).toBe(1); expect(result.overdue).toBe(1);
    expect(result.urgentOrders.map(item => item.id)).toEqual(['3']);
  });
  it('sorts by the active deadline, not an expired confirmation clock after confirmation', () => {
    const result = buildSellerOverview([order('a', 'confirmed', '2020-01-01', '2026-11-07T12:00:00Z'), order('b', 'placed', '2026-11-06T13:00:00Z'), order('c', 'confirmed')], [], [], now);
    expect(result.urgentOrders.map(item => item.id)).toEqual(['b', 'a', 'c']); expect(result.overdue).toBe(0);
  });
  it('separates out of stock from low stock and ignores unpublished products', () => {
    const result = buildSellerOverview([], [{ id: 'a', name: 'A', state: 'published', stock: 0 }, { id: 'b', name: 'B', state: 'published', stock: 5 }, { id: 'c', name: 'C', state: 'draft', stock: 1 }, { id: 'd', name: 'D', state: 'published', stock: 6 }], [], now);
    expect(result.outOfStock.map(item => item.id)).toEqual(['a']); expect(result.lowStock.map(item => item.id)).toEqual(['b']); expect(result.published).toBe(3);
  });
  it('counts returns needing a decision separately from incoming returns', () => {
    const result = buildSellerOverview([], [], ['requested', 'approved', 'in_transit', 'received', 'refunded', 'closed', 'declined'].map(state => ({ state })), now);
    expect(result.pendingReturns).toBe(1); expect(result.incomingReturns).toBe(2);
  });
  it('reports empty stores honestly and never mutates the source order', () => {
    const orders = [order('a', 'placed', '2026-11-07'), order('b', 'placed', '2026-11-06')];
    buildSellerOverview(orders, [], [], now); expect(orders[0]?.id).toBe('a');
    const empty = buildSellerOverview([], [], [], now); expect(empty.totalOrders).toBe(0); expect(empty.urgentOrders).toEqual([]);
  });
});


describe('Cairo period cohorts', () => {
  it('includes Cairo midnight and excludes future orders and the preceding day', () => {
    const base = { ...order('1', 'delivered'), deliveredAt: '2026-11-05T22:30:00Z', merchandisePiastres: 10000, items: [{ sku: 'A', name: 'A', quantity: 2 }] };
    const result = buildOverviewPeriod([{ ...base, placedAt: '2026-11-05T22:30:00Z' }, { ...base, id: '2', placedAt: '2026-10-30T21:59:00Z', deliveredAt: '2026-10-30T21:59:00Z' }, { ...base, id: '3', placedAt: '2026-11-06T13:00:00Z', deliveredAt: '2026-11-06T13:00:00Z' }], 7, now);
    expect(result.placedCount).toBe(1); expect(result.daily.at(-1)?.orders).toBe(1); expect(result.daily).toHaveLength(7);
  });
  it('keeps placed volume separate from completed merchandise and excludes recorded returns', () => {
    const base = { ...order('1', 'delivered'), deliveredAt: '2026-11-05T22:30:00Z', merchandisePiastres: 10000, items: [{ sku: 'A', name: 'A', quantity: 2 }] };
    const result = buildOverviewPeriod([base, { ...base, id: '2', state: 'cancelled' }, { ...base, id: '3' }], 30, now, ['3']);
    expect(result.placedCount).toBe(3); expect(result.deliveredCount).toBe(1); expect(result.grossPiastres).toBe(10000); expect(result.averagePiastres).toBe(10000); expect(result.topProducts[0]?.quantity).toBe(2);
  });
});



it('uses actual delivery date independently from placement and never guesses missing dates', () => {
  const base = { ...order('old', 'delivered'), placedAt: '2026-09-01T12:00:00Z', deliveredAt: '2026-11-06T10:00:00Z', merchandisePiastres: 12000, items: [{ sku: 'A', name: 'A', quantity: 2 }] };
  const result = buildOverviewPeriod([base, { ...base, id: 'new', placedAt: '2026-11-06T11:00:00Z', deliveredAt: null }, { ...base, id: 'outside', placedAt: '2026-11-06T11:00:00Z', deliveredAt: '2026-10-01T11:00:00Z' }], 7, now);
  expect(result.placedCount).toBe(2); expect(result.deliveredCount).toBe(1); expect(result.grossPiastres).toBe(12000); expect(result.daily.at(-1)?.grossPiastres).toBe(12000);
});
