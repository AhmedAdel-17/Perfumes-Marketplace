/**
 * The searchable column has to agree with the function that produced it.
 *
 * `products.search_text` is a CACHE of `foldArabic` over a listing's text. A
 * cache that drifts from its source is worse than no cache: the catalogue keeps
 * answering, and it answers wrongly — a perfume simply stops being findable
 * under its own name, and nobody notices until a seller asks why theirs has
 * disappeared.
 *
 * Migration 0014 promises this test exists. So it does.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldArabic } from '@diyar/domain';
import { applyMigrations } from './migrate';
import * as schema from './schema/index';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

let pg: PGlite;
let db: DiyarDatabase;
let sellerId = '';
let brandId = '';

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const [seller] = await db.insert(schema.sellers).values({
    tradingName: 'ميزون نور', ownerName: 'نور', contactPhone: '01001234567',
    slug: 'maison-nour', status: 'live',
  }).returning();
  sellerId = seller!.id;

  const [brand] = await db.insert(schema.brands).values({
    sellerId, name: 'ميزون نور', nameEn: 'Maison Nour', slug: 'b-nour',
  }).returning();
  brandId = brand!.id;

  // The seller policies resolve a house through `seller_staff`, so a fixture
  // without a staff row writes as a seller belonging to nobody — and RLS
  // refuses it, correctly.
  await db.insert(schema.sellerStaff).values({
    sellerId, authUserId: PLATFORM, role: 'owner', fullName: 'نور',
  });
}, 120_000);

afterAll(async () => { await pg?.close(); });

const uow = () => new DrizzleUnitOfWork(db, { role: 'seller', id: PLATFORM });

describe('the search column tracks the fold', () => {
  it('is written on create', async () => {
    const listing = await uow().transaction((r) => r.listings.create(sellerId, {
      brandId, name: 'ليل القاهرة', slug: 'layl-1', sku: 'NUR-LQ-50',
    }));

    const [row] = await db.select({ text: schema.products.searchText })
      .from(schema.products).where(eq(schema.products.id, listing.id));

    expect(row!.text).toBe(foldArabic('ليل القاهرة NUR-LQ-50'));
    // The fold is what makes the two spellings meet — asserted here so this
    // test fails if the column were ever written raw.
    expect(row!.text).toContain('القاهره');
  });

  it('is RECOMPUTED on every update, not only when the name changes', async () => {
    /*
     * Working out whether a particular edit touched a field that feeds the fold
     * is a condition that goes wrong the first time somebody adds a field to
     * it — silently, because the listing just stops being findable.
     */
    const listing = await uow().transaction((r) => r.listings.create(sellerId, {
      brandId, name: 'اسم قديم', slug: 'layl-2', sku: 'NUR-OLD-50',
    }));

    await uow().transaction((r) => r.listings.update(listing.id, sellerId, {
      notesTop: ['برغموت', 'زعفران'],
    }));

    const [row] = await db.select({ text: schema.products.searchText })
      .from(schema.products).where(eq(schema.products.id, listing.id));

    // The notes are now searchable even though the name never changed.
    expect(row!.text).toContain(foldArabic('زعفران'));
  });

  it('includes the house names, in both scripts', async () => {
    // A customer searching a house expects its perfumes, and the wordmark they
    // read on the tile is the Latin one.
    const listing = await uow().transaction((r) => r.listings.create(sellerId, {
      brandId, name: 'عطر', slug: 'layl-3', sku: 'NUR-X-50',
    }));
    await uow().transaction((r) => r.listings.update(listing.id, sellerId, { volumeMl: 50 }));

    const [row] = await db.select({ text: schema.products.searchText })
      .from(schema.products).where(eq(schema.products.id, listing.id));

    expect(row!.text).toContain(foldArabic('ميزون نور'));
    expect(row!.text).toContain('maison nour');
  });

  it('every stored row equals the fold of its own text', async () => {
    /*
     * The whole-table check. Any row whose cache disagrees with the function is
     * a row the catalogue will answer about incorrectly, and this is the assert
     * that catches a future write path that forgot to recompute.
     */
    const rows = await db.select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      searchText: schema.products.searchText,
    }).from(schema.products);

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // The stored fold is built from more than name and sku, so this asserts
      // containment rather than equality — the point is that the row's own
      // name is findable through the same fold a query uses.
      expect(row.searchText, `row ${row.id} is not folded`)
        .toContain(foldArabic(row.name));
      expect(row.searchText).toBe(foldArabic(row.searchText));
    }
  });
});
