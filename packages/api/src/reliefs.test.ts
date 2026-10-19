/**
 * Reliefs through the real routers (migration 0032).
 *
 * What is proved here and nowhere else: that the console's two steps ask the
 * right questions of what an operator's browser sends. The pipeline that made
 * the files is the domain's and is tested there; the row's rules are the
 * database's and are tested there. Here: only the platform may call this; the
 * keys must be ones issued for this product; the bytes that arrived decide;
 * the placement must be possible; every decision is audited; and files that
 * stop being anything's are removed.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testObservability } from './testing/observability';
import { FixedClock } from '@diyar/domain';
import { DrizzleUnitOfWork, schema, type ActorContext, type DiyarDatabase } from '@diyar/db';
import { applyMigrations } from '@diyar/db/migrate';
import { appRouter } from './routers/index';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';

const CLOCK = new FixedClock(new Date('2026-10-19T09:00:00Z'));
const MEDIA = testMediaStore();
const PLATFORM = '99999999-9999-9999-9999-999999999999';

let pg: PGlite;
let db: DiyarDatabase;
let staffId = '';
let ownerId = '';
let sellerId = '';
let productId = '';
let mediaId = '';
let otherProductId = '';

const caller = (actor: ActorContext, opts: { staff?: boolean; seller?: string | null } = {}) => {
  const ctx: ApiContext = {
    actor,
    sellerId: opts.seller ?? null,
    platformStaffId: opts.staff ? staffId : null,
    platformRole: opts.staff ? 'admin' : null,
    platformLabel: opts.staff ? 'محرّرة المحتوى' : null,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    aftercareUow: new DrizzleUnitOfWork(db, { role: 'aftercare', id: null }),
    intakeUow: new DrizzleUnitOfWork(db, { role: 'intake', id: null }),
    analyticsUow: new DrizzleUnitOfWork(db, { role: 'analytics', id: null }),
    media: MEDIA,
    payoutsEnabled: true,
    observability: testObservability().observability,
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

const ops = () => caller({ role: 'platform', id: PLATFORM }, { staff: true });
const visitor = () => caller({ role: 'anon', id: null });
const house = () => caller({ role: 'seller', id: ownerId }, { seller: sellerId });

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
/** A real PNG header: the signature and an IHDR at the given size. */
const png = (width: number, height: number) => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(width), ...u32(height), 8, 6, 0, 0, 0,
  0, 0, 0, 0,
]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, 0x03, 0x5c, 0x02, 0x05, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xda]);

const PLACEMENT = { centreX: 0.4716, centreY: 0.4922, height: 0.688, angle: 28.1 };

/** Start an upload, then put the given bytes where each URL points — as the console's browser does. */
const upload = async (cutout: Uint8Array, map: Uint8Array, product = productId, media = mediaId) => {
  const started = await ops().reliefs.startUpload({ productId: product, mediaId: media });
  await MEDIA.write(started.cutout.key, cutout);
  await MEDIA.write(started.relief.key, map);
  return { cutoutKey: started.cutout.key, reliefKey: started.relief.key };
};

const auditFor = async (entityId: string) => (await pg.query<{ before: string | null; after: string | null; action: string }>(
  `SELECT action::text AS action, before, after FROM audit_log WHERE entity_table = 'product_media_reliefs' AND entity_id = $1 ORDER BY occurred_at, id`,
  [entityId])).rows;

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  staffId = (await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'محرّرة المحتوى','01000000001','admin') RETURNING id`, [PLATFORM])).rows[0]!.id;

  sellerId = (await pg.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug, city, status, bio, founded_year)
     VALUES ('ميزون نور','نور','maison-nour','القاهرة','live','نبذة',2019) RETURNING id`)).rows[0]!.id;
  ownerId = (await pg.query<{ auth_user_id: string }>(
    `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
     VALUES ($1, gen_random_uuid(), 'owner', 'نور') RETURNING auth_user_id`, [sellerId])).rows[0]!.auth_user_id;
  const brandId = (await pg.query<{ id: string }>(
    `INSERT INTO brands (seller_id, name, name_en, slug) VALUES ($1,'ميزون نور','Maison Nour','maison-nour-brand') RETURNING id`,
    [sellerId])).rows[0]!.id;

  const product = async (slug: string) => {
    const id = (await pg.query<{ id: string }>(
      `INSERT INTO products (
         seller_id, brand_id, name, slug, sku, price_piastres, volume_ml, stock, fulfilment_hours, search_text,
         concentration, form, gender_positioning, scent_family, notes_top, notes_heart, notes_base,
         seasons, day_night, occasions, projection_band, longevity_band,
         performance_source, responsible_party_name, return_eligibility, defect_route, status)
       VALUES ($1,$2,$3,$3,$4,45000,50,5,48,$3,
         'eau_de_parfum','spray','unisex','amber',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['عود'],
         ARRAY['winter']::season[],'night',ARRAY['evening']::occasion[],'strong','very_long',
         'seller_provided','دار','sealed_only','استبدال خلال ١٤ يومًا','draft') RETURNING id`,
      [sellerId, brandId, slug, slug.toUpperCase()])).rows[0]!.id;
    const media = (await pg.query<{ id: string }>(
      `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed,
         content_type, byte_size, width, height, position)
       VALUES ($1,$2,'زجاجة',true,true,'image/jpeg',180000,1000,1250,0) RETURNING id`,
      [id, `products/${id}/${'b'.repeat(24)}.jpg`])).rows[0]!.id;
    await pg.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]);
    return { id, media };
  };
  const layl = await product('layl-al-qahira');
  productId = layl.id; mediaId = layl.media;
  otherProductId = (await product('ward-al-taif')).id;
  await pg.exec('RESET app.actor_role; RESET app.actor_id;');
}, 180_000);

afterAll(async () => { await pg?.close(); });

describe('only the content team works on reliefs', () => {
  it('lists the work for the console', async () => {
    const rows = await ops().reliefs.list();
    expect(rows.map((r) => r.slug).sort()).toEqual(['layl-al-qahira', 'ward-al-taif']);
    expect(rows[0]!.photoUrl).toContain('/dev-media/products/');
  });

  it('is closed to a visitor and to a house — even for its own perfume', async () => {
    await expect(visitor().reliefs.list()).rejects.toThrow();
    await expect(house().reliefs.list()).rejects.toThrow();
    await expect(house().reliefs.startUpload({ productId, mediaId })).rejects.toThrow();
  });
});

describe('reliefs.startUpload', () => {
  it('signs two PNG uploads under the product’s own relief prefix', async () => {
    const started = await ops().reliefs.startUpload({ productId, mediaId });
    for (const part of [started.cutout, started.relief]) {
      expect(part.key).toMatch(new RegExp(`^reliefs/${productId}/[0-9a-f]{24}\\.png$`));
      expect(part.url).toContain('signature=');
    }
    expect(started.cutout.key).not.toBe(started.relief.key);
  });

  it('refuses a photograph that is not the product’s primary', async () => {
    await expect(ops().reliefs.startUpload({ productId, mediaId: '00000000-0000-4000-8000-000000000000' }))
      .rejects.toThrow('تغيّرت الصورة الرئيسية');
  });
});

describe('reliefs.confirm', () => {
  it('records a relief from verified files, with the placement, and audits it', async () => {
    const keys = await upload(png(517, 860), png(517, 860));
    const saved = await ops().reliefs.confirm({ productId, mediaId, ...keys, placement: PLACEMENT, method: 'traced', opaque: false });
    expect(saved).toMatchObject({ width: 517, height: 860, method: 'traced', opaque: false });
    expect(saved.placement.angle).toBeCloseTo(28.1, 2);
    expect(saved.cutoutUrl).toContain(keys.cutoutKey);

    const trail = await auditFor(mediaId);
    expect(trail.at(-1)).toMatchObject({ action: 'listing_moderation', before: null });
    expect(JSON.parse(trail.at(-1)!.after!)).toEqual({ product: 'layl-al-qahira', method: 'traced', opaque: false });
  });

  it('replacing a relief removes the old files from the store', async () => {
    const [before] = await ops().reliefs.list({ productId });
    const oldCutout = new URL(before!.relief!.cutoutUrl).pathname.replace('/dev-media/', '');
    const keys = await upload(png(500, 840), png(500, 840));
    await ops().reliefs.confirm({ productId, mediaId, ...keys, placement: PLACEMENT, method: 'automatic', opaque: true });
    await expect(MEDIA.describe(oldCutout)).resolves.toBeNull();
    const trail = await auditFor(mediaId);
    expect(JSON.parse(trail.at(-1)!.before!)).toMatchObject({ method: 'traced' });
  });

  it('refuses keys issued for another product', async () => {
    const keys = await upload(png(300, 500), png(300, 500), otherProductId, (await ops().reliefs.list({ productId: otherProductId }))[0]!.mediaId);
    await expect(ops().reliefs.confirm({ productId, mediaId, ...keys, placement: PLACEMENT, method: 'traced', opaque: false }))
      .rejects.toThrow('غير صالحة');
  });

  it('refuses a placement the pipeline could not have made', async () => {
    const keys = await upload(png(300, 500), png(300, 500));
    await expect(ops().reliefs.confirm({
      productId, mediaId, ...keys, placement: { ...PLACEMENT, centreX: 1.6 }, method: 'traced', opaque: false,
    })).rejects.toThrow('موضع الزجاجة');
  });

  it('refuses files of different sizes, and removes them', async () => {
    const keys = await upload(png(300, 500), png(310, 500));
    await expect(ops().reliefs.confirm({ productId, mediaId, ...keys, placement: PLACEMENT, method: 'traced', opaque: false }))
      .rejects.toThrow();
    await expect(MEDIA.describe(keys.cutoutKey)).resolves.toBeNull();
    await expect(MEDIA.describe(keys.reliefKey)).resolves.toBeNull();
  });

  it('refuses a file that is not the PNG it claims to be, and removes it', async () => {
    const keys = await upload(jpeg(), png(300, 500));
    await expect(ops().reliefs.confirm({ productId, mediaId, ...keys, placement: PLACEMENT, method: 'traced', opaque: false }))
      .rejects.toThrow();
    await expect(MEDIA.describe(keys.cutoutKey)).resolves.toBeNull();
  });
});

describe('reliefs.remove', () => {
  it('removes the relief and its files, audited', async () => {
    const [before] = await ops().reliefs.list({ productId });
    const cutoutKey = new URL(before!.relief!.cutoutUrl).pathname.replace('/dev-media/', '');
    await expect(ops().reliefs.remove({ productId, mediaId })).resolves.toEqual({ removed: true });
    await expect(MEDIA.describe(cutoutKey)).resolves.toBeNull();
    const [after] = await ops().reliefs.list({ productId });
    expect(after!.relief).toBeNull();
    expect((await auditFor(mediaId)).at(-1)!.after).toBeNull();
    await expect(ops().reliefs.remove({ productId, mediaId })).resolves.toEqual({ removed: false });
  });
});
