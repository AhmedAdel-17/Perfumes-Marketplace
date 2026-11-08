import { describe, expect, it, vi } from 'vitest';
import { sellerCustomerReadModel } from './seller-customer-read-model';
import type { DiyarDatabase } from './repositories';
const customer = { customerRef: `C-${'a'.repeat(32)}`, fullName: 'Actual Customer', completedOrders: '2', firstDeliveredAt: '2020-01-01T00:00:00Z', lastDeliveredAt: '2020-01-02T00:00:00Z' };
const adapter = (value: unknown) => sellerCustomerReadModel({ execute: vi.fn(async () => value) } as unknown as DiyarDatabase);
describe('seller customer driver result normalization', () => {
  it.each(['pglite', 'postgres-js'])('reads the %s result shape without leaking extra fields', async driver => {
    const row = { result: { access: 'owner', customers: [{ ...customer, phone: 'private' }] } };
    const read = adapter(driver === 'pglite' ? { rows: [row] } : [row]);
    const result = await read.leaderboard({ limit: 20 });
    expect(result.access).toBe('owner');
    if (result.access === 'owner') expect(result.customers[0]).toEqual({ ...customer, completedOrders: 2, firstDeliveredAt: new Date(customer.firstDeliveredAt), lastDeliveredAt: new Date(customer.lastDeliveredAt) });
  });
  it('normalizes profile records and an explicit restricted capability', async () => {
    const profile = { ...customer, orders: [{ reference: 'OWN-A', deliveredAt: customer.lastDeliveredAt, address: 'private' }] };
    const result = await adapter([{ result: { access: 'owner', profile } }]).profile({ customerRef: customer.customerRef, limit: 20 });
    expect(result.access).toBe('owner');
    if (result.access === 'owner') expect(result.profile?.orders).toEqual([{ reference: 'OWN-A', deliveredAt: new Date(customer.lastDeliveredAt) }]);
    expect(await adapter({ rows: [{ result: { access: 'restricted' } }] }).leaderboard({ limit: 20 })).toEqual({ access: 'restricted' });
  });
  it('fails rather than returning zeros for malformed, unsafe-count or invalid-date responses', async () => {
    for (const value of [undefined, {}, { rows: [] }, [{ result: { access: 'owner', customers: [{ ...customer, completedOrders: '9007199254740992' }] } }], [{ result: { access: 'owner', customers: [{ ...customer, lastDeliveredAt: 'invalid' }] } }]]) {
      await expect(adapter(value).leaderboard({ limit: 20 })).rejects.toThrow();
    }
  });
});
