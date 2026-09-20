/**
 * The return contract, run against Drizzle + Postgres.
 *
 * `@diyar/domain` runs the identical list against the in-memory adapter. Two
 * adapters, one contract.
 *
 * The world is built through the REAL path — an order placed by the domain's
 * `PlaceOrder`, walked to `delivered` one legal transition at a time — because
 * a fixture that writes `state = 'delivered'` would sail past migration 0001's
 * trigger and prove reviews work on orders that cannot exist.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Address, FixedClock, Money, PlaceOrder,
  returnContract, walkToDelivered, type ReturnContractWorld,
} from '@diyar/domain';
import { applyMigrations } from './migrate';
import * as schema from './schema/index';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const clock = new FixedClock(ORDERED_AT);
const egp = (v: string) => Money.fromMajorString(v);

const NOUR = 'maison-nour';
const WARD = 'dar-al-ward';
const BUYER = 'أحمد عادل محمود';

let keepalive: PGlite;

const harness = async (): Promise<ReturnContractWorld> => {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const [staff] = await db.insert(schema.platformStaff).values({
    authUserId: PLATFORM, fullName: 'مشرفة', phone: '01000000007', role: 'admin',
  }).returning();

  const sellerIdBySlug = new Map<string, string>();
  const productIds: Record<string, string> = {};
  for (const [slug, name, sku, price, ml] of [
    [WARD, 'دار الورد', 'WRD-30', 38_000, 30],
    [NOUR, 'ميزون نور', 'NUR-50', 45_000, 50],
  ] as const) {
    const [seller] = await db.insert(schema.sellers).values({
      tradingName: name, ownerName: 'مالك',
      slug, status: 'live',
    }).returning({ id: schema.sellers.id });
    sellerIdBySlug.set(slug, seller!.id);

    const [brand] = await db.insert(schema.brands).values({
      sellerId: seller!.id, name, slug: `${slug}-brand`,
    }).returning({ id: schema.brands.id });

    const [product] = await db.insert(schema.products).values({
      sellerId: seller!.id, brandId: brand!.id,
      name: slug === WARD ? 'ورد الطائف' : 'ليل القاهرة',
      slug: `${slug}-product`, sku, pricePiastres: price, volumeMl: ml,
      // The listing's own policy, which governs a change of mind and nothing
      // else. Different per house so a case cannot pass by coincidence.
      returnEligibility: slug === NOUR ? 'sealed_only' : 'defect_only',
      // Left as a draft. The publish gate in 0001 refuses a listing missing any
      // of sixteen required fields, and none of them is what these cases are
      // about — a review is of a bottle somebody received, whatever the
      // listing's state is today.
    }).returning({ id: schema.products.id });
    productIds[slug] = product!.id;
  }

  /*
   * The platform Unit of Work builds the world; the CONTRACT then runs through
   * it too. A separate `aftercare` world would be more faithful to production,
   * and it is not what this file is proving: the contract's job is that both
   * adapters behave identically, and the service role's narrowness is proved
   * where it belongs, in the RLS tests.
   */
  const uow = new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM });

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
          productId: productIds[NOUR]!, sellerId: NOUR,
          productName: 'ليل القاهرة', brandName: 'ميزون نور', sku: 'NUR-50',
          volumeMl: 50, quantity: 1, unitPrice: egp('450'),
        },
        {
          productId: productIds[WARD]!, sellerId: WARD,
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

    const identity = new Map([
      [NOUR, sellerIdBySlug.get(NOUR)!],
      [WARD, sellerIdBySlug.get(WARD)!],
    ]);
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
    firstSellerId: sellerIdBySlug.get(NOUR)!,
    moderatorId: staff!.id,
  };
};

beforeAll(async () => { keepalive = new PGlite(); }, 120_000);
afterAll(async () => { await keepalive?.close(); });

describe('return contract — Drizzle + Postgres adapter', () => {
  for (const testCase of returnContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});
