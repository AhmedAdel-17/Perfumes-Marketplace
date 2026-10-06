/**
 * The notes glossary against real Postgres (migration 0030).
 *
 * The rules that matter live in the database, so they are tested there: anyone
 * may read the English names — the English storefront is public — and only the
 * platform may write them. A house writing its own would be the per-product
 * translation the glossary exists to replace.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

let pg: PGlite;
let db: DiyarDatabase;
let staffId = '';
let sellerId = '';

const asPlatform = () => new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM });
const asAnon = () => new DrizzleUnitOfWork(db, { role: 'anon', id: null });
const asSeller = () => new DrizzleUnitOfWork(db, { role: 'seller', id: sellerId });

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  staffId = (await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'محرّرة','01000000009','admin') RETURNING id`, [PLATFORM])).rows[0]!.id;

  sellerId = (await pg.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug, city, status)
     VALUES ('دار','مالك','dar','القاهرة','live') RETURNING id`)).rows[0]!.id;
  const brandId = (await pg.query<{ id: string }>(
    `INSERT INTO brands (seller_id, name, slug) VALUES ($1,'دار','dar-brand') RETURNING id`,
    [sellerId])).rows[0]!.id;

  const listing = (slug: string, top: string[], base: string[]) => pg.query(
    `INSERT INTO products (seller_id, brand_id, name, slug, sku, price_piastres, volume_ml,
       notes_top, notes_heart, notes_base)
     VALUES ($1,$2,$3,$3,$4,40000,50,$5,'{}',$6)`,
    [sellerId, brandId, slug, slug.toUpperCase(), `{${top.join(',')}}`, `{${base.join(',')}}`]);

  await listing('one', ['برغموت', 'هيل'], ['عود']);
  await listing('two', ['برغموت'], ['مسك']);

  await pg.query(`INSERT INTO note_glossary (ar, en, updated_by) VALUES ('عود','Oud',$1)`, [staffId]);
  await pg.query(`INSERT INTO note_glossary (ar, en, updated_by) VALUES ('فانيليا','Vanilla',$1)`, [staffId]);
  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
});

describe('who may read and write the glossary', () => {
  it('anyone reads it, and only the notes asked for', async () => {
    const found = await asAnon().transaction((r) => r.catalogue.noteGlossary(['عود', 'برغموت']));
    expect([...found]).toEqual([['عود', 'Oud']]);
  });

  it('a visitor cannot write it', async () => {
    await expect(asAnon().transaction((r) => r.glossary.set('هيل', 'Cardamom', staffId)))
      .rejects.toThrow();
  });

  it('a house cannot write it — not even for its own notes', async () => {
    await expect(asSeller().transaction((r) => r.glossary.set('هيل', 'Cardamom', staffId)))
      .rejects.toThrow();
    await expect(asSeller().transaction((r) => r.glossary.remove('عود')))
      .resolves.toBe(false);
    const still = await asAnon().transaction((r) => r.catalogue.noteGlossary(['عود']));
    expect(still.get('عود')).toBe('Oud');
  });
});

describe('the console view', () => {
  it('lists every note in use, untranslated first, then by how often it is used', async () => {
    const entries = await asPlatform().transaction((r) => r.glossary.entries());
    expect(entries.slice(0, 3)).toEqual([
      { ar: 'برغموت', en: null, uses: 2 },
      expect.objectContaining({ en: null, uses: 1 }),
      expect.objectContaining({ en: null, uses: 1 }),
    ]);
    // Translated entries follow — including one no listing uses any more.
    expect(entries).toContainEqual({ ar: 'عود', en: 'Oud', uses: 1 });
    expect(entries).toContainEqual({ ar: 'فانيليا', en: 'Vanilla', uses: 0 });
  });

  it('writing an entry reports what it replaced, for the audit trail', async () => {
    const first = await asPlatform().transaction((r) => r.glossary.set('برغموت', 'Bergamot', staffId));
    expect(first.before).toBeNull();
    const second = await asPlatform().transaction((r) => r.glossary.set('برغموت', 'Bergamot orange', staffId));
    expect(second.before).toBe('Bergamot');

    const found = await asAnon().transaction((r) => r.catalogue.noteGlossary(['برغموت']));
    expect(found.get('برغموت')).toBe('Bergamot orange');
  });

  it('removes an entry, and says when there was none', async () => {
    await expect(asPlatform().transaction((r) => r.glossary.remove('فانيليا'))).resolves.toBe(true);
    await expect(asPlatform().transaction((r) => r.glossary.remove('فانيليا'))).resolves.toBe(false);
  });

  it('refuses an empty or over-long English name at the database', async () => {
    await expect(asPlatform().transaction((r) => r.glossary.set('هيل', '   ', staffId))).rejects.toThrow();
    await expect(asPlatform().transaction((r) => r.glossary.set('هيل', 'x'.repeat(41), staffId))).rejects.toThrow();
  });
});

describe('the English half of a CMS page is versioned with the Arabic', () => {
  it('a published revision freezes both halves, and restoring brings both back', async () => {
    const uow = asPlatform();
    const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));
    const arabic = [{ kind: 'passage' as const, text: 'نص' }];
    const english = [{ kind: 'passage' as const, text: 'Text' }];

    await uow.transaction((r) => r.content.saveDraft(page.id, {
      title: 'عن ديار', blocks: arabic, titleEn: 'About DIYAR', blocksEn: english,
    }));
    const first = await uow.transaction((r) => r.content.publish(page.id, staffId));
    expect(first.titleEn).toBe('About DIYAR');
    expect(first.blocksEn).toEqual(english);

    // Saving only the Arabic leaves the English draft as it was.
    await uow.transaction((r) => r.content.saveDraft(page.id, { title: 'عن ديار', blocks: arabic }));
    const kept = await uow.transaction((r) => r.content.findById(page.id));
    expect(kept!.titleEn).toBe('About DIYAR');

    // Clearing the translation, then restoring the revision, brings it back.
    await uow.transaction((r) => r.content.saveDraft(page.id, {
      title: 'عن ديار', blocks: arabic, titleEn: null, blocksEn: [],
    }));
    await uow.transaction((r) => r.content.restore(page.id, first.id));
    const restored = await uow.transaction((r) => r.content.findById(page.id));
    expect(restored!.titleEn).toBe('About DIYAR');
    expect(restored!.draftBlocksEn).toEqual(english);

    const live = await asAnon().transaction((r) => r.content.findLive('about'));
    expect(live!.blocksEn).toEqual(english);
  });
});

describe('a listing\'s English name', () => {
  it('is searchable', async () => {
    const [row] = await pg.query<{ id: string }>(`SELECT id FROM products WHERE slug = 'one'`)
      .then((r) => r.rows);
    await asPlatform().transaction((r) => r.listings.update(row!.id, sellerId, { nameEn: 'Cairo Night' }));
    const [saved] = (await pg.query<{ search_text: string; name_en: string }>(
      `SELECT search_text, name_en FROM products WHERE slug = 'one'`)).rows;
    expect(saved!.name_en).toBe('Cairo Night');
    expect(saved!.search_text).toContain('cairo night');
  });
});
