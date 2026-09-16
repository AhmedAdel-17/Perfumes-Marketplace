/**
 * The door that was open, and the proof it is shut.
 *
 * `seller_manage_own_products` checked whose row it was and nothing else, so a
 * house could write `status = 'published'` on its own product and reach the
 * shopfront without moderation. Migration 0010 closes it with a trigger, and
 * these are the cases that say so.
 *
 * The positive cases matter as much as the negative ones: a guard that also
 * stopped a house editing the price of its own live listing would be traded
 * away within a week, and correctly.
 */
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrate';

let db: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const OWNER = '11111111-1111-1111-1111-111111111111';
const RIVAL = '33333333-3333-3333-3333-333333333333';

const ids = { seller: '', rival: '', brand: '', product: '', live: '' };

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

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const one = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;

  ids.seller = (await one<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
     VALUES ('ميزون نور','نور','01001234567','maison-nour','live') RETURNING id`)).id;
  ids.rival = (await one<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
     VALUES ('دار الورد','خالد','01007654321','dar-al-ward','live') RETURNING id`)).id;

  await db.query(
    `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name) VALUES
      ($1,$2,'owner','نور'), ($3,$4,'owner','خالد')`,
    [ids.seller, OWNER, ids.rival, RIVAL]);

  ids.brand = (await one<{ id: string }>(
    `INSERT INTO brands (seller_id,name,slug) VALUES ($1,'ميزون نور','b-nour') RETURNING id`,
    [ids.seller])).id;

  /*
   * A listing complete enough to publish.
   *
   * Migration 0001 refuses to publish one with missing required fields, media
   * included — so a fixture that skipped them could not create the `published`
   * row these cases are about. Building it properly is also the cheapest
   * end-to-end proof that the domain's completeness rule and the database's
   * publish gate describe the same listing.
   */
  const product = async (slug: string, sku: string, status: string) => {
    const id = (await one<{ id: string }>(
      `INSERT INTO products (
         seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,fulfilment_hours,
         concentration,form,gender_positioning,scent_family,
         notes_top,notes_heart,notes_base,
         seasons,day_night,occasions,projection_band,longevity_band,performance_source,
         responsible_party_name,return_eligibility,defect_route,status)
       VALUES ($1,$2,'ليل القاهرة',$3,$4,45000,50,48,
         'eau_de_parfum','spray','unisex','oud',
         ARRAY['برغموت'],ARRAY['ورد'],ARRAY['عود'],
         ARRAY['winter']::season[],'night',ARRAY['evening']::occasion[],
         'moderate','long','seller_provided',
         'ميزون نور','sealed_only','استبدال خلال ١٤ يومًا','draft')
       RETURNING id`,
      [ids.seller, ids.brand, slug, sku])).id;

    await db.query(
      // `storage_path`, not a URL — the origin of an asset is infrastructure.
      // With the file's facts: since 0024 the publish gate asks for an image the
      // shop could actually render, and a row without them is not one.
      `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed,
         content_type, byte_size, width, height)
       VALUES ($1,'media/nur/layl-1.jpg','زجاجة العطر',true,true,'image/jpeg',180000,1000,1250)`, [id]);

    if (status !== 'draft') {
      await db.query(`UPDATE products SET status=$2::product_status WHERE id=$1`, [id, status]);
    }
    return id;
  };

  ids.product = await product('layl-draft', 'NUR-D-50', 'draft');
  ids.live = await product('layl-live', 'NUR-L-50', 'published');
});

describe('a house may not put its own listing on the shopfront', () => {
  it('refuses an update to published', () => within(async () => {
    await expect(asActor('seller', OWNER,
      `UPDATE products SET status='published' WHERE id=$1`, [ids.product],
    )).rejects.toThrow(/may not move a listing/);
  }));

  it('refuses an update to suspended', () => within(async () => {
    // Suspension is a platform decision too. A house that could suspend its own
    // listing could also un-suspend one the platform took down.
    await expect(asActor('seller', OWNER,
      `UPDATE products SET status='suspended' WHERE id=$1`, [ids.product],
    )).rejects.toThrow(/may not move a listing/);
  }));

  it('refuses a listing CREATED as suspended', () => within(async () => {
    /*
     * The obvious way around a guard that only watches updates — and this is
     * the case that ISOLATES it.
     *
     * Creating one as `published` is refused too, but by the completeness gate
     * from 0001, which fires first and would refuse it whether this trigger
     * existed or not. A test that asserted on that would have passed with the
     * guard deleted. `suspended` reaches this trigger and nothing else.
     */
    await expect(asActor('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'تهريب','smuggled','NUR-S-50',1000,50,'suspended')`,
      [ids.seller, ids.brand],
    )).rejects.toThrow(/may not create a listing/);
  }));

  it('refuses a listing created as published, by one gate or the other', () => within(async () => {
    // Two guards stand in front of this and either is enough. Asserted without
    // naming which, because pinning it to one would make the test fail the day
    // the other one caught it first.
    await expect(asActor('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'تهريب','smuggled-2','NUR-S2-50',1000,50,'published')`,
      [ids.seller, ids.brand],
    )).rejects.toThrow();
  }));
});

describe('what a house may still do', () => {
  it('submits its own draft for moderation', () => within(async () => {
    const r = await asActor('seller', OWNER,
      `UPDATE products SET status='pending_moderation', submitted_at=now() WHERE id=$1`,
      [ids.product]);
    expect(r.affectedRows).toBe(1);
  }));

  it('archives its own listing', () => within(async () => {
    const r = await asActor('seller', OWNER,
      `UPDATE products SET status='archived' WHERE id=$1`, [ids.product]);
    expect(r.affectedRows).toBe(1);
  }));

  it('edits the PRICE of its own live listing', () => within(async () => {
    /*
     * The case that decides whether the guard is usable.
     *
     * The obvious tightening — `WITH CHECK (status <> 'published')` — would
     * refuse this, because the updated row still carries the status it already
     * had. A house unable to correct the price of its own live product would
     * have that guard removed within a week, and would be right.
     */
    const r = await asActor('seller', OWNER,
      `UPDATE products SET price_piastres=48000 WHERE id=$1`, [ids.live]);
    expect(r.affectedRows).toBe(1);
  }));

  it('edits the stock of its own live listing', () => within(async () => {
    const r = await asActor('seller', OWNER,
      `UPDATE products SET stock=3 WHERE id=$1`, [ids.live]);
    expect(r.affectedRows).toBe(1);
  }));
});

describe('the platform still moves listings', () => {
  it('publishes one', () => within(async () => {
    const r = await asActor('platform', PLATFORM,
      `UPDATE products SET status='published', moderated_at=now() WHERE id=$1`, [ids.product]);
    expect(r.affectedRows).toBe(1);
  }));

  it('suspends one, with a coded reason', () => within(async () => {
    const r = await asActor('platform', PLATFORM,
      `UPDATE products SET status='suspended', moderation_reason='prohibited_claim'
       WHERE id=$1`, [ids.live]);
    expect(r.affectedRows).toBe(1);
  }));
});

describe('a draft may have no price or size yet, and nothing else may', () => {
  it('creates a draft with no price and no size', () => within(async () => {
    // A house names a listing long before it decides what to charge. The
    // constraint used to refuse this and the seller saw "something went wrong".
    const r = await asActor<{ id: string }>('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'بلا سعر','no-price-yet','NUR-N-50',0,0,'draft') RETURNING id`,
      [ids.seller, ids.brand]);
    expect(r.rows).toHaveLength(1);
  }));

  it('refuses to move a zero-priced listing out of draft', () => within(async () => {
    /*
     * Strictly stronger than the constraint it replaced.
     *
     * The old rule said `price > 0` in every state, so it was satisfied the
     * moment a row existed and never asked again. This one is checked on the
     * update too, which means a listing cannot reach the queue — or the
     * shopfront — without a price.
     */
    const id = (await asActor<{ id: string }>('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'بلا سعر','no-price-2','NUR-N2-50',0,0,'draft') RETURNING id`,
      [ids.seller, ids.brand])).rows[0]!.id;

    /*
     * Suspended, not archived.
     *
     * The first version archived it, and 0012 exists because that was wrong:
     * archiving an unpriced draft is a house changing its mind, and refusing it
     * left abandoned listings with no way off the list. `draft` and `archived`
     * are both private; the price is required from the moment the listing is in
     * front of anyone else.
     *
     * Suspended is such a state and is not guarded by the completeness gate, so
     * it reaches this constraint and nothing else. The seller status guard
     * refuses it too — hence platform.
     */
    await expect(asActor('platform', PLATFORM,
      `UPDATE products SET status='suspended' WHERE id=$1`, [id],
    )).rejects.toThrow(/products_price_positive/);
  }));

  it('archives an unpriced draft, because that is a house changing its mind', () => within(async () => {
    const id = (await asActor<{ id: string }>('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'مهجور','abandoned','NUR-A-50',0,0,'draft') RETURNING id`,
      [ids.seller, ids.brand])).rows[0]!.id;

    const r = await asActor('seller', OWNER,
      `UPDATE products SET status='archived' WHERE id=$1`, [id]);
    expect(r.affectedRows).toBe(1);
  }));

  it('still refuses a negative price on a draft', () => within(async () => {
    await expect(asActor('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'سالب','negative','NUR-X-50',-1,0,'draft')`,
      [ids.seller, ids.brand],
    )).rejects.toThrow();
  }));

  it('still refuses a negative volume on a draft', () => within(async () => {
    // Zero means undecided; below zero means wrong, in any state.
    await expect(asActor('seller', OWNER,
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status)
       VALUES ($1,$2,'سالب','negative-2','NUR-X2-50',0,-5,'draft')`,
      [ids.seller, ids.brand],
    )).rejects.toThrow();
  }));
});

describe('and none of this weakened the wall between houses', () => {
  it('a rival cannot touch a listing that is not theirs', () => within(async () => {
    // RLS filters the row out, so the update matches nothing and changes
    // nothing. It does not raise — see the note in `content-rls.test.ts`.
    const r = await asActor('seller', RIVAL,
      `UPDATE products SET stock=999 WHERE id=$1`, [ids.live]);
    expect(r.affectedRows ?? 0).toBe(0);
  }));

  it('a rival cannot even see it', () => within(async () => {
    const r = await asActor('seller', RIVAL,
      `SELECT id FROM products WHERE id=$1 AND status <> 'published'`, [ids.product]);
    expect(r.rows).toHaveLength(0);
  }));
});
