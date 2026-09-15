/**
 * The repository contract, run against the in-memory adapter.
 *
 * `packages/db` runs the identical list against Drizzle + Postgres. Two adapters,
 * one contract — which is Liskov substitutability demonstrated rather than
 * asserted (ENGINEERING_PRINCIPLES §2).
 */
import { describe, expect, it } from 'vitest';
import { Money } from '../value-objects/money';
import { Address } from '../value-objects/address';
import { FixedClock } from './clock';
import { PlaceOrder } from '../services/place-order';
import { InMemoryUnitOfWork } from '../testing/in-memory-repositories';
import { repositoryContract, type ContractWorld } from './repository-contract';
import { ownerReportContract } from './owner-report-contract';
import { photoContract } from './photo-contract';
import { contentContract } from './content-contract';
import { contentImageContract } from './content-image-contract';
import { siteContract } from './site-contract';

const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const egp = (v: string) => Money.fromMajorString(v);

const WARD = 'dar-al-ward';
const NOUR = 'maison-nour';

const harness = async (): Promise<ContractWorld> => {
  const uow = new InMemoryUnitOfWork();

  const sellerIdBySlug = new Map([
    [WARD, 'seller-ward'],
    [NOUR, 'seller-nour'],
  ]);

  for (const [slug, id] of sellerIdBySlug) {
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

  return {
    uow,
    sellerIdBySlug,
    wardProductId: 'prod-ward',
    nourProductId: 'prod-nour',
    customerId: 'cust-1',
    async markRemitted(subOrderId) { uow.markRemitted(subOrderId); },
    makeDraft(reference, opts) {
      return new PlaceOrder(new FixedClock(ORDERED_AT)).build({
        reference,
        customerId: 'cust-1',
        contactPhone: '01001234567',
        contactName: 'أحمد',
        address: Address.create({
          governorate: 'cairo', city: 'مدينة نصر', area: 'الحي السابع',
          street: 'شارع عباس العقاد', building: '14', floor: '3', apartment: '7',
          landmark: 'أمام مسجد الرحمن',
        }),
        lines: [
          {
            productId: opts?.bogusProductId ?? 'prod-ward', sellerId: WARD,
            productName: 'ورد الطائف', brandName: 'دار الورد', sku: 'WRD-30',
            volumeMl: 30, quantity: 1, unitPrice: egp('380'),
          },
          {
            productId: 'prod-nour', sellerId: NOUR,
            productName: 'ليل القاهرة', brandName: 'ميزون نور', sku: 'NUR-50',
            volumeMl: 50, quantity: 2, unitPrice: egp('450'),
          },
        ],
        shipping: [
          { sellerId: WARD, amount: egp('50'), etaDaysMin: 3, etaDaysMax: 4 },
          { sellerId: NOUR, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 },
        ],
        terms: [
          { sellerId: WARD, confirmationSlaHours: 24, dispatchSlaHours: 48 },
          { sellerId: NOUR, confirmationSlaHours: 24, dispatchSlaHours: 48 },
        ],
        paymentMethod: 'cod',
        touches: [{ channel: 'organic_search', at: new Date('2026-09-01T21:00:00Z') }],
        priorPurchaseSellerIds: new Set<string>(),
        orderedAt: ORDERED_AT,
      });
    },
  };
};

describe('repository contract — in-memory adapter', () => {
  for (const testCase of repositoryContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases, so an empty contract cannot pass silently', () => {
    expect(repositoryContract.length).toBeGreaterThanOrEqual(10);
  });
});

/*
 * The owner report's facts, over the SAME world as the repository contract.
 *
 * Reused rather than rebuilt: the report reads exactly the orders this harness
 * places, and a second fixture would be a second place for the two houses'
 * terms to drift apart from the ones the order cases depend on.
 */
describe('owner report contract — in-memory adapter', () => {
  for (const testCase of ownerReportContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases', () => {
    expect(ownerReportContract.length).toBeGreaterThanOrEqual(6);
  });
});

describe('photo contract — in-memory adapter', () => {
  for (const testCase of photoContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases', () => {
    expect(photoContract.length).toBeGreaterThanOrEqual(8);
  });
});

describe('site contract — in-memory adapter', () => {
  const siteHarness = async () => ({
    uow: new InMemoryUnitOfWork(),
    staffId: 'staff-1',
  });

  for (const testCase of siteContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(siteHarness)).resolves.toBeUndefined();
    });
  }
});

describe('content contract — in-memory adapter', () => {
  const contentHarness = async () => ({
    uow: new InMemoryUnitOfWork(),
    staffId: 'staff-1',
  });

  for (const testCase of contentContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(contentHarness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases', () => {
    expect(contentContract.length).toBeGreaterThanOrEqual(8);
  });
});

describe('content image contract — in-memory adapter', () => {
  const contentHarness = async () => ({
    uow: new InMemoryUnitOfWork(),
    staffId: 'staff-1',
  });

  for (const testCase of contentImageContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(contentHarness)).resolves.toBeUndefined();
    });
  }

  it('runs every case the contract defines', () => {
    expect(contentImageContract.length).toBeGreaterThanOrEqual(4);
  });
});
