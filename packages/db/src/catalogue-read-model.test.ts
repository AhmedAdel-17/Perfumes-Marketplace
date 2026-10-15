/**
 * The shopfront's reads, and who decides what they return.
 *
 * WHAT CHANGED, AND WHY IT NEEDS A TEST (task P3.4.1, ADR-10). These queries
 * used to run in `apps/web` on the raw connection, which is a SUPERUSER —
 * Postgres never applies row-level security to one — and they carried their own
 * `status = 'published'` and `status = 'live'` filters in the WHERE clause. So
 * the catalogue was correct because the application remembered to be, and the
 * policies in migration 0002 were decoration on this path.
 *
 * Now they run inside a Unit of Work as `anon` and most of those filters are
 * gone, because `public_read_published_products`, `public_read_live_sellers`
 * and `public_read_media` already say the same thing. That is a better
 * arrangement and a strictly more dangerous one to get wrong: if the policies
 * did not bind, a draft product would simply appear in the shop.
 *
 * So every case here runs as `anon`, and the ones that matter are the negative
 * ones — a draft, a house that has only applied, a suspended house. A case that
 * forgot to drop the role would pass while proving nothing.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

let pg: PGlite;
let db: DiyarDatabase;

const asAnon = () => new DrizzleUnitOfWork(db, { role: 'anon', id: null });

const ids: Record<string, string> = {};

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='99999999-9999-9999-9999-999999999999';`);

  const house = async (name: string, slug: string, status: string) => {
    const r = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, city, status, bio, founded_year)
       VALUES ($1,'مالك',$2,'القاهرة',$3::seller_status,'نبذة',2019) RETURNING id`,
      [name, slug, status]);
    const id = r.rows[0]!.id;
    const b = await pg.query<{ id: string }>(
      `INSERT INTO brands (seller_id, name, name_en, slug) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, name, `${slug}-latin`, `${slug}-brand`]);
    return { id, brandId: b.rows[0]!.id };
  };

  /*
   * A complete listing, because the publish gate is real.
   *
   * Migration 0012's trigger refuses `published` while any of twelve required
   * fields is missing, and 0024 added a thirteenth: a verified primary image.
   * So a fixture cannot take a shortcut to `published` — it has to be the thing
   * the gate would admit, which is the right kind of inconvenience.
   */
  const product = async (
    seller: { id: string; brandId: string }, name: string, slug: string, status: string,
    extra: Partial<{ price: number; promo: number; family: string; stock: number }> = {},
  ) => {
    const r = await pg.query<{ id: string }>(
      `INSERT INTO products (
         seller_id, brand_id, name, slug, sku, price_piastres, promo_price_piastres,
         volume_ml, stock, fulfilment_hours, search_text,
         concentration, form, gender_positioning, scent_family,
         notes_top, notes_heart, notes_base,
         seasons, day_night, occasions, projection_band, longevity_band,
         performance_source, responsible_party_name, return_eligibility, defect_route,
         status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
         50,$8,48,$3,
         'eau_de_parfum','spray','unisex',$9::scent_family,
         ARRAY['برغموت'],ARRAY['ورد'],ARRAY['عود'],
         ARRAY['winter']::season[],'night',ARRAY['evening']::occasion[],'strong','very_long',
         'seller_provided','دار','sealed_only','استبدال خلال ١٤ يومًا',
         'draft')
       RETURNING id`,
      [seller.id, seller.brandId, name, slug, slug.toUpperCase(),
        extra.price ?? 40000, extra.promo ?? null, extra.stock ?? 5, extra.family ?? 'oud']);
    const id = r.rows[0]!.id;

    // The verified primary the 0024 gate asks for, with the facts that make it
    // renderable. A row without them is not an image the shop could show.
    await pg.query(
      `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary,
         ownership_confirmed, content_type, byte_size, width, height, position)
       VALUES ($1, $2, 'زجاجة العطر', true, true, 'image/jpeg', 180000, 2400, 3000, 0)`,
      [id, `products/${slug}.jpg`]);

    if (status !== 'draft') {
      await pg.query(`UPDATE products SET status = $2::product_status WHERE id = $1`,
        [id, status]);
    }
    return id;
  };

  const ward = await house('دار الورد', 'dar-al-ward', 'live');
  const applied = await house('دار تتقدّم', 'dar-tataqaddam', 'applied');
  const suspended = await house('دار موقوفة', 'dar-mawqufa', 'suspended');
  ids.ward = ward.id;
  ids.applied = applied.id;
  ids.suspended = suspended.id;

  ids.published = await product(ward, 'ورد الطائف', 'ward-al-taif', 'published',
    { price: 50000, promo: 40000, family: 'floral' });
  ids.second = await product(ward, 'عود ملكي', 'oud-malaki', 'published',
    { price: 90000, family: 'oud' });
  ids.draft = await product(ward, 'مسودة سرّية', 'musawwada', 'draft');
  ids.appliedProduct = await product(applied, 'منتج متقدّم', 'muntaj-mutaqaddim', 'published');
  ids.suspendedProduct = await product(suspended, 'منتج موقوف', 'muntaj-mawquf', 'published');
});

describe('the instrument these cases reason over', () => {
  it('seeded three houses and five products', async () => {
    // Every negative case expects something to be ABSENT. If the fixture never
    // arrived, all of them would pass against an empty database.
    const rows = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM products`);
    expect(rows.rows[0]!.n).toBe(5);
  });
});

describe('a visitor sees the shop, and only the shop', () => {
  it('lists the published products of live houses', async () => {
    const rows = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    expect(rows.map((p) => p.slug).sort()).toEqual(['oud-malaki', 'ward-al-taif']);
  });

  it('lists the most recently published first, because the home page says so', async () => {
    // "Recently registered" is a claim the home page makes about this order.
    // Publish moments set apart by a day, the older one written second, so an
    // insertion-order accident cannot pass for the rule.
    await pg.query(`UPDATE products SET published_at = '2026-10-01' WHERE slug = 'ward-al-taif'`);
    await pg.query(`UPDATE products SET published_at = '2026-10-02' WHERE slug = 'oud-malaki'`);
    const newest = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    expect(newest.map((p) => p.slug)).toEqual(['oud-malaki', 'ward-al-taif']);

    await pg.query(`UPDATE products SET published_at = '2026-10-03' WHERE slug = 'ward-al-taif'`);
    const reordered = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    expect(reordered.map((p) => p.slug)).toEqual(['ward-al-taif', 'oud-malaki']);
  });

  it('does NOT list a draft — and no WHERE clause here says so', async () => {
    /*
     * The heart of the change. The read model asks for every product it can
     * see; `public_read_published_products` is what makes "can see" mean
     * published. If the policy stopped binding, this case fails and a
     * half-written listing appears in the shop.
     */
    const rows = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    expect(rows.some((p) => p.slug === 'musawwada'), 'a draft reached the shopfront')
      .toBe(false);
  });

  it('does not list a published product belonging to a house that only applied', async () => {
    const rows = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    expect(rows.some((p) => p.slug === 'muntaj-mutaqaddim')).toBe(false);
  });

  it('carries the brand’s Latin name and the database’s own vocabulary', async () => {
    // No Arabic here, deliberately: the port returns `floral`, and the router
    // turns it into زهري using `@diyar/i18n`. A read model that returned copy
    // would have to change when the copy does.
    const rows = await asAnon().transaction((r) => r.catalogue.publishedProducts());
    const ward = rows.find((p) => p.slug === 'ward-al-taif')!;
    expect(ward.brandNameEn).toBe('dar-al-ward-latin');
    expect(ward.scentFamily).toBe('floral');
    expect(ward.promoPricePiastres).toBe(40000);
  });

  it('finds one product by its address, with the house it belongs to', async () => {
    const row = await asAnon().transaction((r) => r.catalogue.productBySlug('ward-al-taif'));
    expect(row?.houseSlug).toBe('dar-al-ward');
    expect(row?.notesTop).toEqual(['برغموت']);
  });

  it('answers null for a draft’s address', async () => {
    // Invisible rather than forbidden: a draft reads as "no such product",
    // which is also what it should look like from outside.
    expect(await asAnon().transaction((r) => r.catalogue.productBySlug('musawwada')))
      .toBeNull();
  });
});

describe('a house’s storefront', () => {
  it('opens for a live house', async () => {
    const house = await asAnon().transaction((r) => r.catalogue.houseBySlug('dar-al-ward'));
    expect(house?.tradingName).toBe('دار الورد');
    expect(house?.foundedYear).toBe(2019);
    expect(house?.brandNameEn).toBe('dar-al-ward-latin');
  });

  it('404s for a house that has only applied', async () => {
    expect(await asAnon().transaction((r) => r.catalogue.houseBySlug('dar-tataqaddam')))
      .toBeNull();
  });

  it('404s for a SUSPENDED house rather than showing an empty shopfront', async () => {
    /*
     * This one is not RLS. `public_read_live_sellers` hides an applicant, and a
     * suspended house is a product decision the policy does not express: an
     * empty storefront reads as a bug, and a 404 reads as an answer. The check
     * lives in the read model and says so there.
     */
    expect(await asAnon().transaction((r) => r.catalogue.houseBySlug('dar-mawqufa')))
      .toBeNull();
  });

  it('lists only that house’s published products', async () => {
    const rows = await asAnon().transaction(
      (r) => r.catalogue.publishedProductsForHouse(ids.ward!));
    expect(rows.map((p) => p.slug).sort()).toEqual(['oud-malaki', 'ward-al-taif']);
  });
});

describe('the directory and the filter panel', () => {
  it('counts only live houses with something published', async () => {
    const rows = await asAnon().transaction((r) => r.catalogue.houses());
    expect(rows.map((h) => h.slug)).toEqual(['dar-al-ward']);
    expect(rows[0]!.publishedCount).toBe(2);
    expect(rows[0]!.foundedYear).toBe(2019);
  });

  it('offers every live house in the filter panel', async () => {
    const rows = await asAnon().transaction((r) => r.catalogue.houseFilterOptions());
    expect(rows.map((h) => h.slug)).toEqual(['dar-al-ward']);
  });
});

describe('search narrows in SQL', () => {
  const run = (criteria: Partial<{
    terms: string[]; families: string[]; houses: string[];
    minEgp: number | null; maxEgp: number | null; inStockOnly: boolean;
    sort: 'newest' | 'price_asc' | 'price_desc';
  }>) => asAnon().transaction((r) => r.catalogue.search({
    terms: [], families: [], houses: [], minEgp: null, maxEgp: null,
    inStockOnly: false, sort: 'newest', ...criteria,
  }));

  it('returns the published catalogue when nothing is asked', async () => {
    expect((await run({})).map((p) => p.slug).sort())
      .toEqual(['oud-malaki', 'ward-al-taif']);
  });

  it('narrows by scent family', async () => {
    expect((await run({ families: ['oud'] })).map((p) => p.slug)).toEqual(['oud-malaki']);
  });

  it('compares price against what the customer would PAY', async () => {
    /*
     * ورد الطائف lists at 500 and sells at 400. A filter of "under 450" must
     * include it, because 400 is the number on the card the customer is looking
     * at. Filtering on the list price while showing the promotional one is the
     * defect this expression exists to prevent.
     */
    expect((await run({ maxEgp: 450 })).map((p) => p.slug)).toEqual(['ward-al-taif']);
  });

  it('sorts by the payable price, ascending', async () => {
    expect((await run({ sort: 'price_asc' })).map((p) => p.slug))
      .toEqual(['ward-al-taif', 'oud-malaki']);
  });

  it('never returns a draft, whatever is asked', async () => {
    expect((await run({ terms: ['مسودة'] }))).toEqual([]);
  });
});

describe('photographs', () => {
  it('asks for none when there are no products', async () => {
    expect(await asAnon().transaction((r) => r.catalogue.primaryPhotos([]))).toEqual([]);
  });

  it('returns a verified primary, with the storage key rather than a URL', async () => {
    // A key, not a link: the same object is served from a different host in
    // development and in production, so a row that remembered one would be
    // wrong in the other. The router turns it into a URL.
    const rows = await asAnon().transaction(
      (r) => r.catalogue.primaryPhotos([ids.published!]));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.storageKey).toBe('products/ward-al-taif.jpg');
    expect(rows[0]!.width).toBe(2400);
  });

  it('returns nothing for a photograph that was never verified', async () => {
    /*
     * A row with no `content_type` names a path with no file behind it
     * (migration 0021). Turning one into a URL puts a broken image on a live
     * product, so the absence of facts is the record saying "do not render me".
     *
     * Stripping the facts from an EXISTING row rather than adding a second one,
     * because `is_primary` is one per product and the point is what happens
     * when the primary itself carries nothing.
     */
    await pg.query(
      // All four together: `product_media_facts_all_or_none` refuses a row that
      // knows its size but not its type, which is the right constraint — a
      // half-known file is not a file anybody can render.
      `UPDATE product_media SET content_type = NULL, byte_size = NULL,
         width = NULL, height = NULL
        WHERE product_id = $1`, [ids.second]);

    expect(await asAnon().transaction(
      (r) => r.catalogue.primaryPhotos([ids.second!]))).toEqual([]);
  });
});
