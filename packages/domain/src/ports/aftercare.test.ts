/**
 * The support and application contracts, run against the in-memory adapter.
 *
 * `packages/db` runs the identical lists against Drizzle + Postgres. Until this
 * file existed, both of these in-memory adapters were code that satisfied a
 * type and nothing more.
 */
import { describe, expect, it } from 'vitest';
import { Address } from '../value-objects/address';
import { Money } from '../value-objects/money';
import { FixedClock } from './clock';
import { PlaceOrder } from '../services/place-order';
import { InMemoryUnitOfWork } from '../testing/in-memory-repositories';
import {
  applicationContract, supportContract, type AftercareContractWorld,
} from './aftercare-contract';

const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const clock = new FixedClock(ORDERED_AT);
const egp = (v: string) => Money.fromMajorString(v);

const HOUSE = 'maison-nour';
const BUYER_PHONE = '01001110001';

/**
 * One placed order, and an operator.
 *
 * The support contract needs a real order so it can prove that quoting
 * somebody else's reference does not attach a ticket to it.
 */
const harness = async (): Promise<AftercareContractWorld> => {
  const uow = new InMemoryUnitOfWork();

  uow.addSeller({
    id: 'seller-nour', slug: HOUSE, tradingName: 'ميزون نور', status: 'live',
    confirmationSlaHours: 24, dispatchSlaHours: 48,
    payoutReserveDays: 7, disputeWindowDays: 7,
  });
  uow.addProduct({
    id: 'prod-nour', sellerId: 'seller-nour', slug: 'layl-cairo', name: 'ليل القاهرة',
    sku: 'NUR-50', price: egp('450'), volumeMl: 50, stock: 9, status: 'published',
  });

  const customer = await uow.transaction((r) => r.customers.findOrCreateByPhone({
    phone: BUYER_PHONE, fullName: 'ليلى محمود',
  }));

  const draft = new PlaceOrder(clock).build({
    reference: 'DY-CDFHJKMN',
    customerId: customer.id,
    contactPhone: BUYER_PHONE,
    contactName: 'ليلى محمود',
    address: Address.create({
      governorate: 'cairo', city: 'مدينة نصر', area: 'الحي السابع',
      street: 'شارع عباس العقاد', building: '14',
    }),
    lines: [{
      productId: 'prod-nour', sellerId: HOUSE,
      productName: 'ليل القاهرة', brandName: 'ميزون نور', sku: 'NUR-50',
      volumeMl: 50, quantity: 1, unitPrice: egp('450'),
    }],
    shipping: [{ sellerId: HOUSE, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 }],
    terms: [{ sellerId: HOUSE, confirmationSlaHours: 24, dispatchSlaHours: 48 }],
    paymentMethod: 'cod',
    touches: [],
    priorPurchaseSellerIds: new Set<string>(),
    orderedAt: ORDERED_AT,
  });

  await uow.transaction((r) => r.orders.save(draft, new Map([[HOUSE, 'seller-nour']])));

  return {
    uow,
    order: { reference: 'DY-CDFHJKMN', phone: BUYER_PHONE },
    staffId: 'staff-1',
  };
};

describe('support contract — in-memory adapter', () => {
  for (const testCase of supportContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }
});

describe('application contract — in-memory adapter', () => {
  for (const testCase of applicationContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases, so an empty contract cannot pass silently', () => {
    expect(supportContract.length + applicationContract.length).toBeGreaterThanOrEqual(10);
  });
});
