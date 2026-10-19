/**
 * A photograph's relief against real Postgres (migration 0032).
 *
 * The rule that matters is WHO: the platform's content team makes a relief
 * (founder, 19 Oct 2026); a house may see its own and change none; a visitor
 * sees a published perfume's and nothing else. Those live in row security, so
 * every case runs under the actor it is about — a case that forgot to drop
 * the platform role would pass while proving nothing.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NewRelief } from '@diyar/domain';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

let pg: PGlite;
let db: DiyarDatabase;
let staffId = '';
const ids: Record<string, string> = {};

const asPlatform = () => new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM });
const asAnon = () => new DrizzleUnitOfWork(db, { role: 'anon', id: null });
/** A house's owner, signed in: the actor is the PERSON, and seller_staff says which house. */
const asSeller = (house: 'nour' | 'ward') => new DrizzleUnitOfWork(db, { role: 'seller', id: ids[`${house}Owner`]! });

let n = 0;
const key = () => `reliefs/0f0f0f0f-0000-0000-0000-000000000000/${(++n).toString(16).padStart(24, '0')}.png`;
const relief = (mediaId: string, over: Partial<NewRelief> = {}): NewRelief => ({
  mediaId,
  cutoutKey: key(),
  reliefKey: key(),
  width: 517,
  height: 860,
  cutoutBytes: 380_000,
  reliefBytes: 60_000,
  placement: { centreX: 0.4716, centreY: 0.4922, height: 0.688, angle: 28.1 },
  method: 'traced',
  opaque: false,
  madeBy: staffId,
  ...over,
});

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  staffId = (await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'محرّرة','01000000009','admin') RETURNING id`, [PLATFORM])).rows[0]!.id;

  const house = async (name: string, slug: string) => {
    const id = (await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, slug, city, status, bio, founded_year)
       VALUES ($1,'مالك',$2,'القاهرة','live','نبذة',2019) RETURNING id`, [name, slug])).rows[0]!.id;
    const brandId = (await pg.query<{ id: string }>(
      `INSERT INTO brands (seller_id, name, name_en, slug) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, name, `${slug}-latin`, `${slug}-brand`])).rows[0]!.id;
    const owner = crypto.randomUUID();
    await pg.query(
      `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name) VALUES ($1,$2,'owner','مالك')`,
      [id, owner]);
    return { id, brandId, owner };
  };

  // A complete listing and its verified primary photograph — the publish gate is real.
  const product = async (seller: { id: string; brandId: string }, name: string, slug: string, publish: boolean) => {
    const id = (await pg.query<{ id: string }>(
      `INSERT INTO products (
         seller_id, brand_id, name, slug, sku, price_piastres, volume_ml, stock, fulfilment_hours, search_text,
         concentration, form, gender_positioning, scent_family, notes_top, notes_heart, notes_base,
         seasons, day_night, occasions, projection_band, longevity_band,
         performance_source, responsible_party_name, return_eligibility, defect_route, status)
       VALUES ($1,$2,$3,$4,$5,45000,50,5,48,$3,
         'eau_de_parfum','spray','unisex','amber',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['عود'],
         ARRAY['winter']::season[],'night',ARRAY['evening']::occasion[],'strong','very_long',
         'seller_provided','دار','sealed_only','استبدال خلال ١٤ يومًا','draft')
       RETURNING id`,
      [seller.id, seller.brandId, name, slug, slug.toUpperCase()])).rows[0]!.id;
    const mediaId = (await pg.query<{ id: string }>(
      `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed,
         content_type, byte_size, width, height, position)
       VALUES ($1,$2,'زجاجة',true,true,'image/jpeg',180000,1000,1250,0) RETURNING id`,
      [id, `products/${id}/${'a'.repeat(24)}.jpg`])).rows[0]!.id;
    if (publish) await pg.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]);
    return { id, mediaId };
  };

  const nour = await house('ميزون نور', 'maison-nour');
  const ward = await house('دار الورد', 'dar-al-ward');
  Object.assign(ids, { nour: nour.id, ward: ward.id, nourOwner: nour.owner, wardOwner: ward.owner });
  const layl = await product(nour, 'ليل القاهرة', 'layl-al-qahira', true);
  const draft = await product(nour, 'مسودة', 'musawwada', false);
  const taif = await product(ward, 'ورد الطائف', 'ward-al-taif', true);
  Object.assign(ids, {
    layl: layl.id, laylMedia: layl.mediaId, draft: draft.id, draftMedia: draft.mediaId,
    taif: taif.id, taifMedia: taif.mediaId,
  });
  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
});

describe('the content team makes reliefs', () => {
  it('writes one and reads it back, placement and all', async () => {
    const made = relief(ids.laylMedia!);
    await expect(asPlatform().transaction((r) => r.reliefs.put(made))).resolves.toBeNull();
    const found = await asPlatform().transaction((r) => r.reliefs.forPhoto(ids.laylMedia!));
    expect(found).toMatchObject({ ...made, placement: { centreX: expect.closeTo(0.4716, 4), angle: expect.closeTo(28.1, 4) } });
    expect(found?.madeAt).toBeInstanceOf(Date);
  });

  it('replacing one hands back the one replaced, so its files can be removed', async () => {
    const before = await asPlatform().transaction((r) => r.reliefs.forPhoto(ids.laylMedia!));
    const replaced = await asPlatform().transaction((r) => r.reliefs.put(relief(ids.laylMedia!, { method: 'automatic' })));
    expect(replaced?.cutoutKey).toBe(before?.cutoutKey);
    const now = await asPlatform().transaction((r) => r.reliefs.forPhoto(ids.laylMedia!));
    expect(now?.method).toBe('automatic');
  });

  it('lists the work: products still waiting first, each with its primary photograph', async () => {
    const rows = await asPlatform().transaction((r) => r.reliefs.overview());
    expect(rows.map((row) => [row.slug, row.relief !== null])).toEqual([
      ['musawwada', false], ['ward-al-taif', false], ['layl-al-qahira', true],
    ]);
    expect(rows[2]).toMatchObject({ brandName: 'ميزون نور', photoWidth: 1000, photoHeight: 1250 });
    const one = await asPlatform().transaction((r) => r.reliefs.overview(ids.taif!));
    expect(one.map((row) => row.slug)).toEqual(['ward-al-taif']);
  });

  it('refuses what the pipeline could not have made', async () => {
    await expect(asPlatform().transaction((r) => r.reliefs.put(relief(ids.taifMedia!, { cutoutKey: 'products/x/y.png' }))))
      .rejects.toThrow();
    await expect(asPlatform().transaction((r) => r.reliefs.put(relief(ids.taifMedia!, {
      placement: { centreX: 1.4, centreY: 0.5, height: 0.6, angle: 0 },
    })))).rejects.toThrow();
    await expect(asPlatform().transaction((r) => r.reliefs.put(relief(ids.taifMedia!, { method: 'guessed' as never }))))
      .rejects.toThrow();
  });
});

describe('a visitor sees a published perfume’s relief, and only that', () => {
  it('reads the published one', async () => {
    await expect(asAnon().transaction((r) => r.reliefs.forPhoto(ids.laylMedia!))).resolves.not.toBeNull();
  });

  it('does not see a draft’s', async () => {
    await asPlatform().transaction((r) => r.reliefs.put(relief(ids.draftMedia!)));
    await expect(asAnon().transaction((r) => r.reliefs.forPhoto(ids.draftMedia!))).resolves.toBeNull();
  });

  it('cannot write one', async () => {
    await expect(asAnon().transaction((r) => r.reliefs.put(relief(ids.taifMedia!)))).rejects.toThrow();
  });
});

describe('a house sees its own reliefs and changes none', () => {
  it('reads its own, even on a draft', async () => {
    await expect(asSeller('nour').transaction((r) => r.reliefs.forPhoto(ids.draftMedia!))).resolves.not.toBeNull();
  });

  it('does not read another house’s draft', async () => {
    await expect(asSeller('ward').transaction((r) => r.reliefs.forPhoto(ids.draftMedia!))).resolves.toBeNull();
  });

  it('cannot make, replace or remove one — not even its own', async () => {
    await expect(asSeller('ward').transaction((r) => r.reliefs.put(relief(ids.taifMedia!)))).rejects.toThrow();
    await expect(asSeller('nour').transaction((r) => r.reliefs.remove(ids.laylMedia!))).resolves.toBeNull();
    await expect(asPlatform().transaction((r) => r.reliefs.forPhoto(ids.laylMedia!))).resolves.not.toBeNull();
  });
});

describe('a relief belongs to its photograph', () => {
  it('goes when the photograph goes', async () => {
    await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
    await pg.query(`DELETE FROM product_media WHERE id = $1`, [ids.draftMedia]);
    await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
    await expect(asPlatform().transaction((r) => r.reliefs.forPhoto(ids.draftMedia!))).resolves.toBeNull();
  });

  it('removing one returns it, and says when there was none', async () => {
    const removed = await asPlatform().transaction((r) => r.reliefs.remove(ids.laylMedia!));
    expect(removed?.mediaId).toBe(ids.laylMedia);
    await expect(asPlatform().transaction((r) => r.reliefs.remove(ids.laylMedia!))).resolves.toBeNull();
  });
});
