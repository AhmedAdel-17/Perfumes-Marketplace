/**
 * The SAME repository contract, run against Drizzle + Postgres.
 *
 * `@diyar/domain` runs this list against an in-memory adapter. If a case passes
 * there and here, the behaviour is in the contract rather than in one adapter's
 * accident — which is Liskov substitutability demonstrated, not asserted.
 *
 * Any divergence shows up as the same named case failing on one side only.
 */
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrate';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Address, FixedClock, Money, PlaceOrder,
  repositoryContract, type ContractWorld,
  ownerReportContract,
  contentContract, type ContentContractWorld,
  siteContract, type SiteContractWorld,
} from '@diyar/domain';
import * as schema from './schema/index';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';

const MIGRATIONS = join(import.meta.dirname, '../migrations');
const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const egp = (v: string) => Money.fromMajorString(v);

const WARD = 'dar-al-ward';
const NOUR = 'maison-nour';

let client: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';

/**
 * A fresh world per case.
 *
 * Each case gets its own schema-loaded database rather than a shared one, so an
 * atomicity failure in one cannot leave residue that makes the next pass.
 */
const harness = async (): Promise<ContractWorld> => {
  const pg = new PGlite();
  // 0002 included deliberately: the adapter now drops to the unprivileged role
  // on every transaction, so the contract runs through RLS exactly as production
  // does rather than against an unguarded database.
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  // Seeding runs as the owner, outside the Unit of Work.
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const sellerIdBySlug = new Map<string, string>();
  for (const [slug, name] of [[WARD, 'دار الورد'], [NOUR, 'ميزون نور']] as const) {
    const [s] = await db.insert(schema.sellers).values({
      tradingName: name, ownerName: 'مالك', contactPhone: '01001234567',
      slug, status: 'live',
    }).returning({ id: schema.sellers.id });
    sellerIdBySlug.set(slug, s!.id);
  }

  const [customer] = await db.insert(schema.customers)
    .values({ phone: '01009998877', fullName: 'أحمد' })
    .returning({ id: schema.customers.id });

  const productIds: Record<string, string> = {};
  for (const [slug, price, sku] of [[WARD, 38000, 'WRD-30'], [NOUR, 45000, 'NUR-50']] as const) {
    const sellerId = sellerIdBySlug.get(slug)!;
    const [b] = await db.insert(schema.brands)
      .values({ sellerId, name: slug, slug: `${slug}-brand` })
      .returning({ id: schema.brands.id });
    const [p] = await db.insert(schema.products).values({
      sellerId, brandId: b!.id, name: 'عطر', slug: `${slug}-product`,
      sku, pricePiastres: price, volumeMl: 50,
    }).returning({ id: schema.products.id });
    productIds[slug] = p!.id;
  }

  return {
    // Repository mechanics are exercised as a platform operator, which is the
    // role that legitimately touches every table.
    uow: new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM }),
    sellerIdBySlug,
    wardProductId: productIds[WARD]!,
    nourProductId: productIds[NOUR]!,
    customerId: customer!.id,
    async markRemitted(subOrderId) {
      await db.insert(schema.shipments).values({
        subOrderId, courier: 'bosta', codRemittedAt: new Date('2026-09-10T00:00:00Z'),
      });
    },
    makeDraft(reference, opts) {
      return new PlaceOrder(new FixedClock(ORDERED_AT)).build({
        reference,
        customerId: customer!.id,
        contactPhone: '01001234567',
        contactName: 'أحمد',
        address: Address.create({
          governorate: 'cairo', city: 'مدينة نصر', area: 'الحي السابع',
          street: 'شارع عباس العقاد', building: '14', floor: '3', apartment: '7',
          landmark: 'أمام مسجد الرحمن',
        }),
        lines: [
          {
            productId: opts?.bogusProductId ?? productIds[WARD]!, sellerId: WARD,
            productName: 'ورد الطائف', brandName: 'دار الورد', sku: 'WRD-30',
            volumeMl: 30, quantity: 1, unitPrice: egp('380'),
          },
          {
            productId: productIds[NOUR]!, sellerId: NOUR,
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

beforeAll(async () => { client = new PGlite(); }, 120_000);
afterAll(async () => { await client?.close(); });

describe('repository contract — Drizzle + Postgres adapter', () => {
  for (const testCase of repositoryContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});

/*
 * The owner report's facts, over the same world — and through RLS as the
 * platform, which is the only role that may read across every house.
 *
 * This is the half that matters: `respondedAt` and `exitReason` come from the
 * transition log here, and "cash in hand" from shipment rows, none of which the
 * in-memory adapter has to reconstruct.
 */
describe('owner report contract — Drizzle + Postgres adapter', () => {
  for (const testCase of ownerReportContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});

/**
 * A world with an operator in it, because a revision records who published it.
 *
 * Its own harness rather than an extra field on the other one: the content
 * cases need a `platform_staff` row and none of the order cases do, and a
 * fixture that seeds everything for everybody is a fixture where nobody can
 * tell which row a case actually depends on.
 */
const contentHarness = async (): Promise<ContentContractWorld> => {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const [staff] = await db.insert(schema.platformStaff).values({
    authUserId: PLATFORM, fullName: 'محرّرة', phone: '01000000009', role: 'admin',
  }).returning();

  return {
    uow: new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM }),
    staffId: staff!.id,
  };
};

/** The same world the content cases use — an operator, and nothing else. */
const siteHarness = async (): Promise<SiteContractWorld> => {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  const [staff] = await db.insert(schema.platformStaff).values({
    authUserId: PLATFORM, fullName: 'مشغّلة', phone: '01000000008', role: 'admin',
  }).returning();

  return {
    uow: new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM }),
    staffId: staff!.id,
  };
};

describe('site contract — Drizzle + Postgres adapter', () => {
  for (const testCase of siteContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(siteHarness)).resolves.toBeUndefined();
    }, 60_000);
  }
});

describe('content contract — Drizzle + Postgres adapter', () => {
  for (const testCase of contentContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(contentHarness)).resolves.toBeUndefined();
    }, 60_000);
  }
});
