/**
 * Content images, at the database boundary — migration 0022.
 *
 * A visitor may learn that an image exists only while a live page is serving
 * it. An upload for a draft is unpublished content; an image that only an OLD
 * revision used was taken off the site on purpose; an archived page serves
 * nothing. Each of those is a case below, because each is a different clause of
 * one policy and "simplifying" any of them opens a different leak.
 *
 * The table's own constraints are proved here too: the key shape the server
 * issues and no other, and no row with a fact missing.
 */
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrate';

let db: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';

const key = (n: number) => `content/rls/${n.toString(16).padStart(24, '0')}.jpg`;
const KEYS = {
  served: key(1),
  draftOnly: key(2),
  oldRevisionOnly: key(3),
  archived: key(4),
  neverUsed: key(5),
};

const asActor = async <T>(role: string, actorId: string | null, sql: string, params: unknown[] = []) => {
  await db.exec(`SET LOCAL app.actor_role = '${role}'`);
  await db.exec(`SET LOCAL app.actor_id = '${actorId ?? ''}'`);
  await db.exec('SET LOCAL ROLE app_user');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('RESET ROLE').catch(() => undefined);
  }
};

const within = async <T>(fn: () => Promise<T>): Promise<T> => {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
};

const withImage = (storageKey: string) => JSON.stringify([
  { kind: 'heading', level: 2, text: 'صفحة' },
  { kind: 'image', mediaKey: storageKey, alt: 'زجاجة' },
]);

const visibleKeys = async (role: string, actorId: string | null) => {
  const r = await asActor<{ storage_key: string }>(role, actorId,
    'SELECT storage_key FROM content_images ORDER BY storage_key');
  return r.rows.map((row) => row.storage_key);
};

let staffId = '';

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const one = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;

  staffId = (await one<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'محرّرة','01000000009','admin') RETURNING id`, [PLATFORM])).id;

  for (const storageKey of Object.values(KEYS)) {
    await db.query(
      `INSERT INTO content_images (storage_key, content_type, byte_size, width, height, uploaded_by)
       VALUES ($1,'image/jpeg',900000,2400,1600,$2)`, [storageKey, staffId]);
  }

  const page = async (slug: string, state: string, draftKey: string) => (await one<{ id: string }>(
    `INSERT INTO content_pages (slug, title, state, draft_blocks)
     VALUES ($1,$1,$2::content_page_state,$3::jsonb) RETURNING id`, [slug, state, withImage(draftKey)])).id;

  const revision = async (pageId: string, storageKey: string) => (await one<{ id: string }>(
    `INSERT INTO content_revisions (page_id, title, blocks, published_by)
     VALUES ($1,'صفحة',$2::jsonb,$3) RETURNING id`, [pageId, withImage(storageKey), staffId])).id;

  // A live page: an old revision used one image, the served one uses another,
  // and the draft being edited uses a third.
  const live = await page('journal', 'draft', KEYS.draftOnly);
  await revision(live, KEYS.oldRevisionOnly);
  const served = await revision(live, KEYS.served);
  await db.query('UPDATE content_pages SET published_revision_id=$2 WHERE id=$1', [live, served]);

  // An archived page whose last revision still names its image.
  const retired = await page('retired', 'archived', KEYS.archived);
  const retiredRevision = await revision(retired, KEYS.archived);
  await db.query('UPDATE content_pages SET published_revision_id=$2 WHERE id=$1', [retired, retiredRevision]);

  await db.exec('RESET app.actor_role; RESET app.actor_id;');
});

describe('which content images the public may read', () => {
  it('reads exactly the image the live page is serving', () => within(async () => {
    expect(await visibleKeys('anon', null)).toEqual([KEYS.served]);
  }));

  it('a signed-in customer sees no more than an anonymous visitor', () => within(async () => {
    expect(await visibleKeys('customer', '22222222-2222-2222-2222-222222222222')).toEqual([KEYS.served]);
  }));

  it('the platform sees every image, served or not', () => within(async () => {
    expect(await visibleKeys('platform', PLATFORM)).toEqual(Object.values(KEYS).sort());
  }));

  it('the public cannot record an image', () => within(async () => {
    await expect(asActor('anon', null,
      `INSERT INTO content_images (storage_key, content_type, byte_size, width, height, uploaded_by)
       VALUES ($1,'image/jpeg',1,1,1,$2)`, [key(99), staffId])).rejects.toThrow();
  }));
});

describe('what a content image row may be', () => {
  const insert = (storageKey: string, facts = `'image/jpeg', 900000, 2400, 1600`) => within(() =>
    asActor('platform', PLATFORM,
      `INSERT INTO content_images (storage_key, content_type, byte_size, width, height, uploaded_by)
       VALUES ($1, ${facts}, $2)`, [storageKey, staffId]));

  it('accepts the key shape the server issues', async () => {
    await expect(insert(key(50))).resolves.toBeDefined();
  });

  it.each([
    ['a product photograph’s key', 'products/3f1c2a9e-0000-4000-8000-000000000000/aaaaaaaaaaaaaaaaaaaaaaaa.jpg'],
    ['a path outside the store', '../content/x/aaaaaaaaaaaaaaaaaaaaaaaa.jpg'],
    ['an extension the store does not serve', 'content/x/aaaaaaaaaaaaaaaaaaaaaaaa.gif'],
    ['a URL', 'https://example.com/content/x/aaaaaaaaaaaaaaaaaaaaaaaa.jpg'],
  ])('refuses %s', async (_what, storageKey) => {
    await expect(insert(storageKey)).rejects.toThrow();
  });

  it.each([
    ['a missing width', `'image/jpeg', 900000, NULL, 1600`],
    ['a missing type', `NULL, 900000, 2400, 1600`],
    ['a type the store does not serve', `'image/gif', 900000, 2400, 1600`],
    ['a file over the size limit', `'image/jpeg', 10485761, 2400, 1600`],
    ['a zero dimension', `'image/jpeg', 900000, 0, 1600`],
  ])('refuses %s', async (_what, facts) => {
    await expect(insert(key(51), facts)).rejects.toThrow();
  });
});
