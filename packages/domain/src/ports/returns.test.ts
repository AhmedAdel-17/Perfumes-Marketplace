/**
 * The return contract, run against the in-memory adapter.
 *
 * The world is the review world — the same two delivered orders — because a
 * return and a review are the same authorisation problem with different
 * consequences, and building the fixture twice is how the two come to disagree
 * about what "delivered" means.
 */
import { describe, expect, it } from 'vitest';
import { Money } from '../value-objects/money';
import { Address } from '../value-objects/address';
import { FixedClock } from './clock';
import { PlaceOrder } from '../services/place-order';
import { InMemoryUnitOfWork } from '../testing/in-memory-repositories';
import { walkToDelivered } from './review-contract';
import { returnContract, type ReturnContractWorld } from './return-contract';

const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const clock = new FixedClock(ORDERED_AT);
const egp = (v: string) => Money.fromMajorString(v);

const NOUR = 'maison-nour';
const WARD = 'dar-al-ward';

/**
 * Three orders: two delivered on different phones, one still in flight.
 *
 * Both delivered orders contain `prod-nour`, because a line item can be
 * reviewed exactly once — so two reviews of one perfume require two purchases
 * of it, which is also the only way it happens in life.
 */
const harness = async (): Promise<ReturnContractWorld> => {
  const uow = new InMemoryUnitOfWork();

  for (const [slug, id] of [[WARD, 'seller-ward'], [NOUR, 'seller-nour']] as const) {
    uow.addSeller({
      id, slug, tradingName: slug, status: 'live',
      confirmationSlaHours: 24, dispatchSlaHours: 48,
      payoutReserveDays: 7, disputeWindowDays: 7,
    });
  }
  uow.addProduct({
    id: 'prod-ward', sellerId: 'seller-ward', slug: 'ward-taif', name: 'ورد الطائف',
    sku: 'WRD-30', price: egp('380'), volumeMl: 30, stock: 5, status: 'published',
  });
  uow.addProduct({
    id: 'prod-nour', sellerId: 'seller-nour', slug: 'layl-cairo', name: 'ليل القاهرة',
    sku: 'NUR-50', price: egp('450'), volumeMl: 50, stock: 9, status: 'published',
  });
  // The listing's own policy, which governs a change of mind and nothing else.
  uow.setReturnEligibility('prod-nour', 'sealed_only');
  uow.setReturnEligibility('prod-ward', 'defect_only');

  /* The customer row is created through the repository, not written by hand. */
  const BUYER = 'أحمد عادل محمود';
  const place = async (reference: string, phone: string) => {
    const customer = await uow.transaction((r) => r.customers.findOrCreateByPhone({
      phone, fullName: BUYER,
    }));
    const draft = new PlaceOrder(clock).build({
      reference,
      customerId: customer.id,
      contactPhone: phone,
      contactName: BUYER,
      address: Address.create({
        governorate: 'cairo', city: 'مدينة نصر', area: 'الحي السابع',
        street: 'شارع عباس العقاد', building: '14',
      }),
      lines: [
        {
          productId: 'prod-nour', sellerId: NOUR,
          productName: 'ليل القاهرة', brandName: 'ميزون نور', sku: 'NUR-50',
          volumeMl: 50, quantity: 1, unitPrice: egp('450'),
        },
        {
          productId: 'prod-ward', sellerId: WARD,
          productName: 'ورد الطائف', brandName: 'دار الورد', sku: 'WRD-30',
          volumeMl: 30, quantity: 1, unitPrice: egp('380'),
        },
      ],
      shipping: [
        { sellerId: NOUR, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 },
        { sellerId: WARD, amount: egp('50'), etaDaysMin: 3, etaDaysMax: 4 },
      ],
      terms: [
        { sellerId: NOUR, confirmationSlaHours: 24, dispatchSlaHours: 48 },
        { sellerId: WARD, confirmationSlaHours: 24, dispatchSlaHours: 48 },
      ],
      paymentMethod: 'cod',
      touches: [],
      priorPurchaseSellerIds: new Set<string>(),
      orderedAt: ORDERED_AT,
    });

    const identity = new Map([[NOUR, 'seller-nour'], [WARD, 'seller-ward']]);
    return uow.transaction((r) => r.orders.save(draft, identity));
  };

  const first = await place('DY-FIRST001', '01001110001');
  const second = await place('DY-SECOND02', '01001110002');
  await place('DY-INFLIGHT', '01001110003');

  for (const saved of [first, second]) {
    for (const subOrderId of saved.subOrderIds) {
      await walkToDelivered(uow, subOrderId, clock);
    }
  }

  return {
    uow,
    first: { reference: 'DY-FIRST001', phone: '01001110001' },
    second: { reference: 'DY-SECOND02', phone: '01001110002' },
    undelivered: { reference: 'DY-INFLIGHT', phone: '01001110003' },
    // The house that packed the first line of the first order.
    firstSellerId: 'seller-nour',
    moderatorId: 'staff-1',
  };
};

describe('return contract — in-memory adapter', () => {
  for (const testCase of returnContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases, so an empty contract cannot pass silently', () => {
    expect(returnContract.length).toBeGreaterThanOrEqual(8);
  });
});
