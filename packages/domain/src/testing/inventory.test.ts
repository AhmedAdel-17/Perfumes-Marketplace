/** Stock invariants of the in-memory reference, independent of SQL triggers. */
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from './in-memory-repositories';
import { Money } from '../value-objects/money';
import { Address } from '../value-objects/address';
import { PlaceOrder } from '../services/place-order';
import { FixedClock } from '../ports/clock';
import { SubOrderLifecycle, type SubOrderState, type Actor, type ReasonCode } from '../state-machines/sub-order';

const at = new Date('2026-11-07T10:00:00Z');
const clock = new FixedClock(at);
const egp = (value: string) => Money.fromMajorString(value);
const seller = 'house-1';
const product = 'product-1';
const sellerIds = new Map([['house', seller]]);
const setup = (stock = 5) => {
  const uow = new InMemoryUnitOfWork();
  uow.addSeller({ id: seller, slug: 'house', tradingName: 'House', status: 'live', confirmationSlaHours: 24, dispatchSlaHours: 48, payoutReserveDays: 7, disputeWindowDays: 7 });
  uow.addProduct({ id: product, sellerId: seller, slug: 'perfume', name: 'Perfume', sku: 'P-1', volumeMl: 50, price: egp('100'), stock, status: 'published' });
  return uow;
};
const draft = (reference: string, quantity = 2) => new PlaceOrder(clock).build({
  reference, customerId: 'customer-1', contactPhone: '01001234567', contactName: 'Customer',
  address: Address.create({ governorate: 'cairo', city: 'Cairo', area: 'Nasr', street: 'Street', building: '1' }),
  lines: [{ productId: product, sellerId: 'house', productName: 'Perfume', brandName: 'House', sku: 'P-1', volumeMl: 50, quantity, unitPrice: egp('100') }],
  shipping: [{ sellerId: 'house', amount: egp('20'), etaDaysMin: 2, etaDaysMax: 4 }],
  terms: [{ sellerId: 'house', confirmationSlaHours: 24, dispatchSlaHours: 48 }],
  paymentMethod: 'cod', touches: [], priorPurchaseSellerIds: new Set(), orderedAt: at,
});
const stock = (uow: InMemoryUnitOfWork) => uow.transaction((r) => r.inventory.summary(product));
const transition = (uow: InMemoryUnitOfWork, id: string, to: SubOrderState, actor: Actor, reason: ReasonCode | null = null) => uow.transaction(async (r) => {
  const current = await r.subOrders.findById(id);
  const record = SubOrderLifecycle.transition(current!.state, { to, actor, ...(reason ? { reason } : {}) }, clock);
  await r.subOrders.applyTransition(id, to, actor, reason, record);
});

describe('in-memory inventory reference', () => {
  it('reserves availability atomically and rejects a second checkout that would oversell', async () => {
    const uow = setup(3);
    await uow.transaction((r) => r.orders.save(draft('DY-FIRST'), sellerIds));
    expect(await stock(uow)).toEqual({ productId: product, onHand: 3, reserved: 2, available: 1 });
    expect((await uow.transaction((r) => r.products.snapshotForCart([product])))[0]?.stock).toBe(1);
    await expect(uow.transaction((r) => r.orders.save(draft('DY-SECOND'), sellerIds))).rejects.toThrow('Insufficient stock');
    expect(await uow.transaction((r) => r.orders.findByReference('DY-SECOND'))).toBeNull();
    expect((await uow.transaction((r) => r.inventory.movements(product, 10)))).toHaveLength(1);
  });

  it('releases rejected orders without changing physical on-hand', async () => {
    const uow = setup();
    const placed = await uow.transaction((r) => r.orders.save(draft('DY-REJECT'), sellerIds));
    await transition(uow, placed.subOrderIds[0]!, 'awaiting_seller', 'system');
    await transition(uow, placed.subOrderIds[0]!, 'rejected', 'seller', 'out_of_stock');
    expect(await stock(uow)).toEqual({ productId: product, onHand: 5, reserved: 0, available: 5 });
    const rows = await uow.transaction((r) => r.inventory.movements(product, 10));
    expect(rows[0]).toMatchObject({ kind: 'release', deltaOnHand: 0, deltaReserved: -2 });
  });

  it('consumes dispatch once and never restocks a refused parcel automatically', async () => {
    const uow = setup();
    const placed = await uow.transaction((r) => r.orders.save(draft('DY-SHIP'), sellerIds));
    const id = placed.subOrderIds[0]!;
    await transition(uow, id, 'awaiting_seller', 'system'); await transition(uow, id, 'confirmed', 'seller');
    await transition(uow, id, 'dispatched', 'seller');
    expect(await stock(uow)).toEqual({ productId: product, onHand: 3, reserved: 0, available: 3 });
    await expect(transition(uow, id, 'dispatched', 'seller')).rejects.toThrow();
    await transition(uow, id, 'refused', 'platform', 'customer_refused');
    expect(await stock(uow)).toEqual({ productId: product, onHand: 3, reserved: 0, available: 3 });
  });

  it('validates explicit corrections, handles optimistic conflicts, and replays without a duplicate movement', async () => {
    const uow = setup();
    const command = { productId: product, expectedOnHand: 5, delta: 3, reason: 'restock' as const, requestId: 'restock-1', occurredAt: at };
    expect(await uow.transaction((r) => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 8 } });
    expect(await uow.transaction((r) => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 8 } });
    expect(await uow.transaction((r) => r.inventory.adjust({ ...command, delta: 4 }))).toEqual({ ok: false, reason: 'conflict' });
    expect(await uow.transaction((r) => r.inventory.adjust({ ...command, requestId: 'stale' }))).toEqual({ ok: false, reason: 'conflict' });
    expect(await uow.transaction((r) => r.inventory.adjust({ ...command, requestId: 'invalid', delta: -1 }))).toEqual({ ok: false, reason: 'invalid' });
    expect(await uow.transaction((r) => r.inventory.movements(product, 10))).toHaveLength(1);
  });

  it('keeps adjustments above held units and rolls back stock, movements, replay keys and order holds', async () => {
    const uow = setup();
    await uow.transaction((r) => r.orders.save(draft('DY-HOLD', 4), sellerIds));
    expect(await uow.transaction((r) => r.inventory.adjust({ productId: product, expectedOnHand: 5, delta: -2, reason: 'damage', requestId: 'damage-1', occurredAt: at }))).toEqual({ ok: false, reason: 'insufficient_stock' });
    const command = { productId: product, expectedOnHand: 5, delta: 1, reason: 'restock' as const, requestId: 'rolled-back', occurredAt: at };
    await expect(uow.transaction(async (r) => { await r.inventory.adjust(command); throw new Error('Rollback'); })).rejects.toThrow('Rollback');
    expect(await stock(uow)).toMatchObject({ onHand: 5, reserved: 4, available: 1 });
    expect(await uow.transaction((r) => r.inventory.movements(product, 10))).toHaveLength(1);
    expect(await uow.transaction((r) => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 6 } });
    await expect(uow.transaction(async (r) => { await r.orders.save(draft('DY-ROLLBACK', 1), sellerIds); throw new Error('Rollback'); })).rejects.toThrow();
    expect(await stock(uow)).toMatchObject({ onHand: 6, reserved: 4, available: 2 });
  });
});
