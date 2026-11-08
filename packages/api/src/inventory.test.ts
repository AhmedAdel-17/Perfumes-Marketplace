/** Inventory API authorization and validation. SQL isolation is separately proved
 * in packages/db/src/inventory.test.ts; this suite exercises the real router. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryUnitOfWork, Money } from '@diyar/domain';
import { appRouter } from './routers/index';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';
import { testObservability } from './testing/observability';

const OWNER = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const PRODUCT = '33333333-3333-3333-3333-333333333333';
const at = new Date('2026-11-07T10:00:00Z');
const media = testMediaStore();
const fixture = (role: ApiContext['actor']['role'] = 'seller', sellerId: string | null = SELLER) => {
  const uow = new InMemoryUnitOfWork();
  uow.addSeller({ id: SELLER, slug: 'inventory', tradingName: 'Inventory', status: 'live', confirmationSlaHours: 24,
    dispatchSlaHours: 48, payoutReserveDays: 7, disputeWindowDays: 7 });
  uow.addProduct({ id: PRODUCT, sellerId: SELLER, name: 'Perfume', slug: 'inventory-perfume', sku: 'P-1',
    price: Money.fromMinor(10000), volumeMl: 50, stock: 5, status: 'published' });
  const ctx: ApiContext = {
    actor: { role, id: role === 'anon' ? null : OWNER }, sellerId,
    platformStaffId: null, platformRole: null, platformLabel: null,
    uow, checkoutUow: uow, aftercareUow: uow, intakeUow: uow, analyticsUow: uow,
    media, payoutsEnabled: false, observability: testObservability().observability, clock: new FixedClock(at),
  };
  return appRouter.createCaller(ctx);
};
const command = () => ({ productId: PRODUCT, requestId: randomUUID(), expectedOnHand: 5, delta: 2, reason: 'restock' as const });

describe('seller inventory API boundary', () => {
  it.each(['anon', 'customer'] as const)('rejects %s access for stock, history and adjustment', async (role) => {
    const caller = fixture(role);
    await expect(caller.inventory.stock({ productId: PRODUCT })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.inventory.movements({ productId: PRODUCT })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.inventory.adjust(command())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('requires a server-resolved seller context', async () => {
    await expect(fixture('seller', null).inventory.stock({ productId: PRODUCT })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('applies a valid correction once and returns server-clock movement times as ISO strings', async () => {
    const caller = fixture(); const input = command();
    expect(await caller.inventory.stock({ productId: PRODUCT })).toEqual({ productId: PRODUCT, onHand: 5, reserved: 0, available: 5 });
    expect(await caller.inventory.adjust(input)).toMatchObject({ ok: true, stock: { onHand: 7, available: 7 } });
    expect(await caller.inventory.adjust(input)).toMatchObject({ ok: true, stock: { onHand: 7 } });
    const rows = await caller.inventory.movements({ productId: PRODUCT, limit: 1 });
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ reason: 'restock', deltaOnHand: 2, occurredAt: at.toISOString() });
  });
  it('rejects malformed, excessive and seller-selecting input before mutation', async () => {
    const caller = fixture(); const input = command();
    for (const delta of [0, 1.5, 100001, -100001]) {
      await expect(caller.inventory.adjust({ ...input, delta })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    await expect(caller.inventory.adjust({ ...input, requestId: 'bad-id' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.inventory.adjust({ ...input, expectedOnHand: -1 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const untrusted = { ...input, sellerId: randomUUID() };
    await expect(caller.inventory.adjust(untrusted)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const clientClock = { ...input, occurredAt: '2000-01-01T00:00:00Z' };
    await expect(caller.inventory.adjust(clientClock)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.inventory.movements({ productId: PRODUCT, limit: 101 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.inventory.stock({ productId: 'invalid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await caller.inventory.stock({ productId: PRODUCT })).toMatchObject({ onHand: 5 });
  });
  it('returns an explicit optimistic conflict without applying a second command', async () => {
    const caller = fixture(); const input = command(); await caller.inventory.adjust(input);
    expect(await caller.inventory.adjust({ ...input, requestId: randomUUID() })).toEqual({ ok: false, reason: 'conflict' });
    expect(await caller.inventory.stock({ productId: PRODUCT })).toMatchObject({ onHand: 7 });
  });
});
