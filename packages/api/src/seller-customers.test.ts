/** API boundary proofs; tenant/owner enforcement is also tested against SQL. */
import { describe, expect, it, vi } from 'vitest';
import type { Repositories, SellerCustomerLeaderboard, SellerCustomerProfileResult } from '@diyar/domain';
import type { ApiContext } from './trpc';
import { sellerCustomersRouter } from './routers/seller-customers';
import { testObservability } from './testing/observability';
const reference = `C-${'a'.repeat(32)}`;
const summary = { customerRef: reference, fullName: 'Actual Customer A', completedOrders: 3,
  firstDeliveredAt: new Date('2020-01-01T00:00:00Z'), lastDeliveredAt: new Date('2020-02-01T00:00:00Z') };
function fixture(result: SellerCustomerLeaderboard, role: ApiContext['actor']['role'] = 'seller', sellerId: string | null = '11111111-1111-1111-1111-111111111111', profileResult: SellerCustomerProfileResult = { access: 'restricted' }) {
  const leaderboard = vi.fn(async () => result); const profile = vi.fn(async () => profileResult);
  const repositories = { sellerCustomers: { leaderboard, profile } } as unknown as Repositories;
  const ctx = { actor: { role, id: '22222222-2222-2222-2222-222222222222' }, sellerId,
    uow: { transaction: async <T>(work: (r: Repositories) => Promise<T>) => work(repositories) },
    observability: testObservability().observability,
  } as unknown as ApiContext;
  return { caller: sellerCustomersRouter.createCaller(ctx), leaderboard, profile };
}

describe('seller customer leaderboard API boundary', () => {
  it('preserves explicit access restriction instead of returning false zero counts', async () => {
    const { caller } = fixture({ access: 'restricted' });
    expect(await caller.leaderboard()).toEqual({ access: 'restricted' });
    expect(await caller.profile({ customerRef: reference })).toEqual({ access: 'restricted' });
  });
  it('rejects tenant/customer selectors and unbounded input before the repository', async () => {
    const { caller, leaderboard, profile } = fixture({ access: 'restricted' });
    for (const input of [{ sellerId: 'another-house' }, { customerId: 'another-person' }, { limit: 0 }, { limit: 51 }, { limit: 1.5 }]) {
      await expect(caller.leaderboard(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    for (const input of [{ customerRef: 'raw-customer-uuid' }, { customerRef: reference, sellerId: 'another-house' }, { customerRef: reference, limit: 51 }]) {
      await expect(caller.profile(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(leaderboard).not.toHaveBeenCalled(); expect(profile).not.toHaveBeenCalled();
  });
  it('rejects anonymous/customer roles and missing house membership', async () => {
    for (const role of ['anon', 'customer'] as const) {
      const { caller, leaderboard, profile } = fixture({ access: 'restricted' }, role);
      await expect(caller.leaderboard()).rejects.toBeDefined();
      await expect(caller.profile({ customerRef: reference })).rejects.toBeDefined();
      expect(leaderboard).not.toHaveBeenCalled(); expect(profile).not.toHaveBeenCalled();
    }
    const { caller, leaderboard } = fixture({ access: 'restricted' }, 'seller', null);
    await expect(caller.leaderboard()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(leaderboard).not.toHaveBeenCalled();
  });
  it('allows the actual customer name while stripping all unapproved profile fields', async () => {
    const row = { ...summary, customerId: 'private-uuid', phone: '01001234567', name: 'Private recipient', socialHandle: '@private' };
    const { caller, leaderboard } = fixture({ access: 'owner', customers: [row] });
    const response = await caller.leaderboard({ limit: 5 });
    expect(leaderboard).toHaveBeenCalledWith({ limit: 5 });
    expect(response).toEqual({ access: 'owner', ranking: 'completed_order_count', period: 'all_time', excludesAnyRecordedReturn: true,
      customers: [{ customerRef: reference, fullName: 'Actual Customer A', completedOrders: 3, firstDeliveredAt: '2020-01-01T00:00:00.000Z', lastDeliveredAt: '2020-02-01T00:00:00.000Z' }] });
    expect(JSON.stringify(response)).not.toMatch(/private|01001234567|customerId|phone|socialHandle/);
  });
  it('returns only own completed references and dates in the private profile', async () => {
    const row = { ...summary, orders: [{ reference: 'A-OWN-1', deliveredAt: new Date('2020-02-01T00:00:00Z'), phone: '01001234567' }], gender: 'private', dateOfBirth: 'private', address: 'private' };
    const { caller, profile } = fixture({ access: 'owner', customers: [] }, 'seller', '11111111-1111-1111-1111-111111111111', { access: 'owner', profile: row });
    const response = await caller.profile({ customerRef: reference, limit: 5 });
    expect(profile).toHaveBeenCalledWith({ customerRef: reference, limit: 5 });
    expect(response.access).toBe('owner');
    if (response.access === 'owner') expect(response.profile?.orders).toEqual([{ reference: 'A-OWN-1', deliveredAt: '2020-02-01T00:00:00.000Z' }]);
    expect(JSON.stringify(response)).not.toMatch(/private|phone|dateOfBirth|gender|address/);
    const unknown = fixture({ access: 'owner', customers: [] }, 'seller', '11111111-1111-1111-1111-111111111111', { access: 'owner', profile: null });
    expect(await unknown.caller.profile({ customerRef: reference })).toEqual({ access: 'owner', profile: null });
  });
});
