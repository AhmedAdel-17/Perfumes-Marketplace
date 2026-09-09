/**
 * The support and application contracts, run against Drizzle + Postgres.
 *
 * `@diyar/domain` runs the identical lists against the in-memory adapter. Until
 * these two files existed, both ports had two implementations and nothing
 * comparing them — which is the one thing the whole ports-and-adapters
 * arrangement is supposed to buy.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Address, FixedClock, Money, PlaceOrder,
  applicationContract, supportContract, type AftercareContractWorld,
} from '@diyar/domain';
import { applyMigrations } from './migrate';
import * as schema from './schema/index';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const clock = new FixedClock(ORDERED_AT);
const egp = (v: string) => Money.fromMajorString(v);

const HOUSE = 'maison-nour';
const BUYER_PHONE = '01001110001';

let keepalive: PGlite;

const harness = async (): Promise<AftercareContractWorld> => {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const [staff] = await db.insert(schema.platformStaff).values({
    authUserId: PLATFORM, fullName: 'مشغّلة', phone: '01000000006', role: 'admin',
  }).returning();

  const [seller] = await db.insert(schema.sellers).values({
    tradingName: 'ميزون نور', ownerName: 'مالك', contactPhone: '01001234567',
    slug: HOUSE, status: 'live',
  }).returning({ id: schema.sellers.id });

  const [brand] = await db.insert(schema.brands).values({
    sellerId: seller!.id, name: 'ميزون نور', slug: 'nour-brand',
  }).returning({ id: schema.brands.id });

  const [product] = await db.insert(schema.products).values({
    sellerId: seller!.id, brandId: brand!.id, name: 'ليل القاهرة',
    slug: 'layl-cairo', sku: 'NUR-50', pricePiastres: 45_000, volumeMl: 50,
  }).returning({ id: schema.products.id });

  /*
   * Built as the PLATFORM, which is what these contracts run as too.
   *
   * The service roles' narrowness is proved where it belongs — in the RLS
   * tests. What this file proves is that the two adapters behave identically,
   * and running one of them through a restricted role would be testing the
   * policy rather than the adapter.
   */
  const uow = new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM });

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
      productId: product!.id, sellerId: HOUSE,
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

  await uow.transaction((r) => r.orders.save(draft, new Map([[HOUSE, seller!.id]])));

  return {
    uow,
    order: { reference: 'DY-CDFHJKMN', phone: BUYER_PHONE },
    staffId: staff!.id,
  };
};

beforeAll(async () => { keepalive = new PGlite(); }, 120_000);
afterAll(async () => { await keepalive?.close(); });

describe('support contract — Drizzle + Postgres adapter', () => {
  for (const testCase of supportContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});

describe('application contract — Drizzle + Postgres adapter', () => {
  for (const testCase of applicationContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});
