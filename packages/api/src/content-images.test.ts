/**
 * Editorial images through the real routers — WORK_PLAN 5.7.6.
 *
 * What is proved here and nowhere else: the whole path from an operator's upload
 * to a visitor's page. The contract proves the store; the RLS test proves who
 * may read a row; this proves the routers ask them the right questions — that a
 * key typed by hand cannot be published, that a verified one can, and that the
 * visitor is handed an address for exactly the images the page serves.
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

const CLOCK = new FixedClock(new Date('2026-09-15T09:00:00Z'));
const MEDIA = testMediaStore();

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
const ANON: ActorContext = { role: 'anon', id: null };

let pg: PGlite;
let db: DiyarDatabase;
let staffId = '';

const caller = (actor: ActorContext, platform: { staffId: string; role: string } | null) => {
  const ctx: ApiContext = {
    actor,
    sellerId: null,
    platformStaffId: platform?.staffId ?? null,
    platformRole: platform?.role ?? null,
    platformLabel: platform ? 'مشغّلة المنصّة' : null,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    aftercareUow: new DrizzleUnitOfWork(db, { role: 'aftercare', id: null }),
    intakeUow: new DrizzleUnitOfWork(db, { role: 'intake', id: null }),
    analyticsUow: new DrizzleUnitOfWork(db, { role: 'analytics', id: null }),
    media: MEDIA,
    // This suite does not run payouts; the switch is on so it behaves as development.
    payoutsEnabled: true,
    observability: testObservability().observability,
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

const ops = () => caller(PLATFORM_ACTOR, { staffId, role: 'admin' });
const visitor = () => caller(ANON, null);

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** A real JPEG header: SOI, JFIF, a baseline frame at the given size. */
const jpeg = (width: number, height: number) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  0xff, 0xda,
]);

/** A fresh page — its id from the router, its slug as chosen here. */
const newPage = async () => {
  const slug = `journal-${Math.random().toString(36).slice(2, 8)}`;
  const { id } = await ops().content.create({ slug, title: 'دفتر العطّار' });
  return { id, slug };
};

/** Start an upload for a page and put the bytes where the URL points. */
const upload = async (pageId: string, bytes: Uint8Array) => {
  const started = await ops().contentImages.startUpload({
    pageId, contentType: 'image/jpeg', byteSize: bytes.length,
  });
  await MEDIA.write(started.key, bytes);
  return started.key;
};

const withImage = (mediaKey: string) => [
  { kind: 'heading' as const, level: 2 as const, text: 'في المعمل' },
  { kind: 'image' as const, mediaKey, alt: 'قوارير الزيوت على رفّ خشبي' },
];

const publish = async (pageId: string, mediaKey: string) => {
  await ops().content.saveDraft({ id: pageId, title: 'دفتر العطّار', blocks: withImage(mediaKey) });
  await ops().content.move({ id: pageId, to: 'in_review' });
  await ops().content.move({ id: pageId, to: 'published' });
};

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  const staff = await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'مشغّلة المنصّة','01000000001','admin') RETURNING id`, [PLATFORM]);
  staffId = staff.rows[0]!.id;
  await pg.exec('RESET app.actor_role; RESET app.actor_id;');
}, 180_000);

afterAll(async () => { await pg?.close(); });

describe('contentImages.startUpload', () => {
  it('signs an upload under the page’s own prefix', async () => {
    const page = await newPage();
    const started = await ops().contentImages.startUpload({
      pageId: page.id, contentType: 'image/webp', byteSize: 400_000,
    });
    expect(started.key).toMatch(new RegExp(`^content/${page.id}/[0-9a-f]{24}\\.webp$`));
    expect(started.url).toContain('signature=');
  });

  it('refuses a page that does not exist', async () => {
    await expect(ops().contentImages.startUpload({
      pageId: '00000000-0000-4000-8000-000000000000', contentType: 'image/jpeg', byteSize: 1000,
    })).rejects.toThrow('الصفحة غير موجودة');
  });

  it('refuses a file the size alone rules out, before signing anything', async () => {
    const page = await newPage();
    await expect(ops().contentImages.startUpload({
      pageId: page.id, contentType: 'image/jpeg', byteSize: 10 * 1024 * 1024 + 1,
    })).rejects.toThrow();
  });

  it('is not open to a visitor', async () => {
    const page = await newPage();
    await expect(visitor().contentImages.startUpload({
      pageId: page.id, contentType: 'image/jpeg', byteSize: 1000,
    })).rejects.toThrow();
  });
});

describe('contentImages.confirm', () => {
  it('verifies what arrived and returns its address and real dimensions', async () => {
    const page = await newPage();
    const key = await upload(page.id, jpeg(2400, 1600));

    const image = await ops().contentImages.confirm({ pageId: page.id, key });
    expect(image).toEqual({ key, url: MEDIA.publicUrl(key), width: 2400, height: 1600 });
  });

  it('confirming twice returns the same image', async () => {
    const page = await newPage();
    const key = await upload(page.id, jpeg(2400, 1600));
    const first = await ops().contentImages.confirm({ pageId: page.id, key });
    expect(await ops().contentImages.confirm({ pageId: page.id, key })).toEqual(first);
  });

  it('refuses a key issued for another page, or for a product', async () => {
    const one = await newPage();
    const other = await newPage();
    const key = await upload(one.id, jpeg(2400, 1600));

    await expect(ops().contentImages.confirm({ pageId: other.id, key })).rejects.toThrow('رابط الصورة غير صالح');
    await expect(ops().contentImages.confirm({
      pageId: one.id, key: `products/${one.id}/${'a'.repeat(24)}.jpg`,
    })).rejects.toThrow('رابط الصورة غير صالح');
  });

  it('refuses an image too small to stay sharp, and removes the file', async () => {
    const page = await newPage();
    const key = await upload(page.id, jpeg(400, 300));

    await expect(ops().contentImages.confirm({ pageId: page.id, key })).rejects.toThrow();
    // It can never become an image, so it does not stay in storage.
    expect(await MEDIA.describe(key)).toBeNull();
  });

  it('refuses a key nothing was uploaded to', async () => {
    const page = await newPage();
    await expect(ops().contentImages.confirm({
      pageId: page.id, key: `content/${page.id}/${'b'.repeat(24)}.jpg`,
    })).rejects.toThrow('لم تصل الصورة إلى التخزين');
  });
});

describe('an image block on a published page', () => {
  it('cannot be published with a key that was never verified', async () => {
    const page = await newPage();
    const typed = `content/${page.id}/${'c'.repeat(24)}.jpg`;

    const saved = await ops().content.saveDraft({ id: page.id, title: 'دفتر العطّار', blocks: withImage(typed) });
    // Told while writing, not after asking to publish.
    expect(saved.objections.map((o) => o.code)).toContain('unverified_image');

    // Refused as an OBJECTION, not an error — content that is not ready is an
    // editor's ordinary working state (see `content.move`). Nothing moves.
    await ops().content.move({ id: page.id, to: 'in_review' });
    const attempt = await ops().content.move({ id: page.id, to: 'published' });
    expect(attempt.objections).toEqual([{ code: 'unverified_image', blockIndex: 1 }]);
    expect(attempt.state).toBe('in_review');
    expect(await visitor().content.read({ slug: page.slug })).toBeNull();
  });

  it('is served to a visitor with the address of exactly the images it uses', async () => {
    const page = await newPage();
    const key = await upload(page.id, jpeg(2400, 1600));
    await ops().contentImages.confirm({ pageId: page.id, key });

    // A second verified image the page does NOT use must not be handed out.
    const unused = await upload(page.id, jpeg(1600, 2400));
    await ops().contentImages.confirm({ pageId: page.id, key: unused });

    await publish(page.id, key);

    const served = await visitor().content.read({ slug: page.slug });
    expect(served).not.toBeNull();
    expect(served!.images).toEqual({ [key]: { url: MEDIA.publicUrl(key), width: 2400, height: 1600 } });
  });
});
