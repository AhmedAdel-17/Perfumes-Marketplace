/** Seller-scoped pagination and batched thumbnails, through real RLS + routers. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@diyar/domain';
import { applyMigrations } from '@diyar/db/migrate';
import { DrizzleUnitOfWork, schema, type DiyarDatabase, type ActorContext } from '@diyar/db';
import { appRouter } from './routers/index';
import { testMediaStore } from './testing/media';
import { testObservability } from './testing/observability';
import type { ApiContext } from './trpc';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const PLATFORM = '99999999-9999-9999-9999-999999999999';
const media = testMediaStore();
const queries: string[] = [];
let pg: PGlite;
let db: DiyarDatabase;
let sellerId: string;
let otherSellerId: string;
let productIds: string[];
let otherPhotoKey: string;

const house = (actor: ActorContext = { role: 'seller', id: OWNER }, seller = sellerId) => {
  const uow = new DrizzleUnitOfWork(db, actor);
  const context: ApiContext = {
    actor, sellerId: seller, platformStaffId: null, platformRole: null, platformLabel: null,
    uow, checkoutUow: uow, aftercareUow: uow, intakeUow: uow, analyticsUow: uow,
    media, payoutsEnabled: false, observability: testObservability().observability,
    clock: new FixedClock(new Date('2026-11-07T10:00:00Z')),
  };
  return appRouter.createCaller(context);
};

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema, logger: { logQuery: (query) => queries.push(query) } }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  for (const [slug, owner] of [['batch-house', OWNER], ['other-house', OTHER]]) {
    const seller = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name,owner_name,slug,status) VALUES ($1,'Owner',$1,'live') RETURNING id`, [slug],
    );
    const id = seller.rows[0]!.id;
    if (owner === OWNER) sellerId = id; else otherSellerId = id;
    await pg.query(`INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name) VALUES ($1,$2,'owner','Owner')`, [id, owner]);
    const brand = await pg.query<{ id: string }>(`INSERT INTO brands (seller_id,name,slug) VALUES ($1,$2,$2) RETURNING id`, [id, slug]);
    await pg.query(
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock,status,updated_at)
       SELECT $1,$2,'Perfume ' || n,$3 || '-' || n,'SKU-' || n,0,0,0,'draft','2026-11-01T10:00:00.123456Z'
       FROM generate_series(1,$4::int) n`, [id, brand.rows[0]!.id, slug, owner === OWNER ? 103 : 2],
    );
  }
  const own = await pg.query<{ id: string }>(`SELECT id FROM products WHERE seller_id=$1 ORDER BY updated_at DESC,id DESC`, [sellerId]);
  productIds = own.rows.map((row) => row.id);
  const other = await pg.query<{ id: string }>(`SELECT id FROM products WHERE seller_id=$1 LIMIT 1`, [otherSellerId]);
  otherPhotoKey = `products/${other.rows[0]!.id}/${'b'.repeat(24)}.jpg`;
  for (const [id, key] of [[productIds[0]!, `products/${productIds[0]!}/${'a'.repeat(24)}.jpg`], [other.rows[0]!.id, otherPhotoKey]]) {
    await pg.query(`INSERT INTO product_media (product_id,storage_path,alt_text,is_primary,ownership_confirmed,content_type,byte_size,width,height)
      VALUES ($1,$2,'Verified bottle',true,true,'image/jpeg',1000,1000,1250)`, [id, key]);
  }
  await pg.query(`INSERT INTO product_media (product_id,storage_path,alt_text,is_primary,ownership_confirmed)
    VALUES ($1,'legacy.jpg','Unverified bottle',true,true)`, [productIds[1]!]);
}, 180_000);
afterAll(async () => { await pg?.close(); });

const catalogueQueries = () => queries.filter((query) => query.includes('from "products"') || query.includes('from "product_media"'));

describe('seller catalogue bounded reads', () => {
  it('reports stale listing stock as an explicit conflict and accepts a current snapshot', async () => {
    const id = productIds[0]!;
    const before = await house().listings.get({ id });
    await pg.query('UPDATE products SET stock=3 WHERE id=$1', [id]);
    await expect(house().listings.save({ id, draft: { name: 'Stale name', stock: 0 }, expectedStock: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await house().listings.get({ id })).toMatchObject({ name: before.name, stock: 3 });
    await house().listings.save({ id, draft: { stock: 4 }, expectedStock: 3 });
    expect((await house().listings.get({ id })).stock).toBe(4);
  });

  it('preserves the complete legacy array with bounded batch reads and no private other-house media', async () => {
    queries.length = 0;
    const rows = await house().listings.mine();
    expect(rows).toHaveLength(103);
    expect(catalogueQueries()).toHaveLength(3); // one listing + two batches of at most 100 ids
    expect(rows.find((row) => row.id === productIds[0])?.primaryPhoto).toMatchObject({ alt: 'Verified bottle', width: 1000, height: 1250 });
    expect(rows.find((row) => row.id === productIds[1])?.primaryPhoto).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(otherPhotoKey);
  });

  it('pages tied microsecond timestamps without duplicates or missing rows, with two reads per nonempty page', async () => {
    const seen: string[] = [];
    let cursor: { updatedAt: string; id: string } | undefined;
    do {
      queries.length = 0;
      const page = await house().listings.minePage({ limit: 17, ...(cursor ? { cursor } : {}) });
      expect(page.items.length).toBeLessThanOrEqual(17);
      expect(catalogueQueries()).toHaveLength(2);
      seen.push(...page.items.map((row) => row.id));
      if (page.nextCursor) expect(page.nextCursor.updatedAt).toBe('2026-11-01T10:00:00.123456Z');
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(productIds);
    expect(new Set(seen).size).toBe(103);
  });

  it('keeps cursor selection tenant-scoped and returns no photo query on an empty page', async () => {
    const own = await house().listings.minePage({ limit: 1 });
    const other = await house({ role: 'seller', id: OTHER }, otherSellerId).listings.minePage({ limit: 1, cursor: own.nextCursor! });
    expect(other.items.every((row) => !productIds.includes(row.id))).toBe(true);
    queries.length = 0;
    const empty = await house().listings.minePage({ limit: 10, cursor: { updatedAt: '2020-01-01T00:00:00Z', id: productIds[0]! } });
    expect(empty).toEqual({ items: [], nextCursor: null });
    expect(catalogueQueries()).toHaveLength(1);
  });

  it('rejects excessive page sizes, malformed cursors, anonymous access and seller-selecting input', async () => {
    await expect(house().listings.minePage({ limit: 101 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(house().listings.minePage({ limit: 0 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(house().listings.minePage({ limit: 1, cursor: { updatedAt: 'invalid', id: productIds[0]! } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(house({ role: 'anon', id: null }).listings.minePage({ limit: 1 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const untrusted = { limit: 1, sellerId: otherSellerId };
    await expect(house().listings.minePage(untrusted)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
