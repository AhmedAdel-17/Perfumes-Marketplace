import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';

let db: PGlite;
const CUSTOMER_AUTH = '11111111-1111-4111-8111-111111111111';
const SELLER_AUTH = '22222222-2222-4222-8222-222222222222';
const OTHER_SELLER_AUTH = '33333333-3333-4333-8333-333333333333';
const PLATFORM = '99999999-9999-4999-8999-999999999999';
const ANON = 'a1b2c3d4e5f6a7b8c9d0e1f2';
let customer: string; let seller: string; let otherSeller: string;
let brand: string; let product: string; let session: string;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0]!;

const asActor = async <T>(role: string, actor: string | null, sql: string, params: unknown[] = []) => {
  await db.exec(`SET app.actor_role='${role}'; SET app.actor_id='${actor ?? ''}'; SET ROLE app_user`);
  try { return await db.query<T>(sql, params); }
  finally { await db.exec('RESET ROLE'); }
};

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}'`);
  customer = (await one<{ id: string }>(
    `INSERT INTO customers(phone, auth_user_id) VALUES('01012345678',$1) RETURNING id`, [CUSTOMER_AUTH])).id;
  seller = (await one<{ id: string }>(
    `INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Seller','Owner','customer-data-seller','live') RETURNING id`)).id;
  otherSeller = (await one<{ id: string }>(
    `INSERT INTO sellers(trading_name,owner_name,slug,status) VALUES('Other','Owner','customer-data-other','live') RETURNING id`)).id;
  await db.query(`INSERT INTO seller_staff(seller_id,auth_user_id,role,full_name) VALUES($1,$2,'owner','Owner'),($3,$4,'owner','Other')`,
    [seller, SELLER_AUTH, otherSeller, OTHER_SELLER_AUTH]);
  brand = (await one<{ id: string }>(`INSERT INTO brands(seller_id,name,slug) VALUES($1,'Brand','customer-data-brand') RETURNING id`, [seller])).id;
  product = (await one<{ id: string }>(
    `INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
     VALUES($1,$2,'Perfume','customer-data-product','CD-1',10000,50) RETURNING id`, [seller, brand])).id;
  session = crypto.randomUUID();
  await asActor('analytics', null,
    `INSERT INTO customer_data_sessions(id,anonymous_id,channel) VALUES($1,$2,'web')`, [session, ANON]);
}, 180_000);

afterAll(async () => db?.close());

describe('required profile and structured preferences', () => {
  it('requires plausible birth date and controlled gender, deriving age dynamically', async () => {
    await expect(db.query(
      `INSERT INTO customer_profiles(customer_id,birth_date,gender,data_source)
       VALUES($1,NULL,'male','customer')`, [customer])).rejects.toThrow();
    await expect(db.query(
      `INSERT INTO customer_profiles(customer_id,birth_date,gender,data_source)
       VALUES($1,CURRENT_DATE + 1,'male','customer')`, [customer])).rejects.toThrow();
    await db.query(
      `INSERT INTO customer_profiles(customer_id,birth_date,gender,data_source)
       VALUES($1,DATE '2000-06-15','male','customer')`, [customer]);
    const result = await one<{ stored_age: number; computed_age: number }>(
      `SELECT count(*) FILTER (WHERE column_name='age')::int AS stored_age,
              app.age_years(DATE '2000-06-15') AS computed_age
         FROM information_schema.columns WHERE table_name='customer_profiles'`);
    expect(result.stored_age).toBe(0);
    expect(result.computed_age).toBeGreaterThan(24);
  });

  it('validates budget and bottle sizes and records value-free change history', async () => {
    await expect(db.query(
      `INSERT INTO customer_fragrance_preferences(customer_id,budget_min_piastres,budget_max_piastres,preferred_bottle_sizes_ml,data_source)
       VALUES($1,5000,1000,ARRAY[50],'customer')`, [customer])).rejects.toThrow();
    await db.query(
      `INSERT INTO customer_fragrance_preferences(customer_id,fragrance_families,occasions,budget_min_piastres,budget_max_piastres,preferred_bottle_sizes_ml,data_source)
       VALUES($1,ARRAY['oud']::scent_family[],ARRAY['evening']::occasion[],1000,5000,ARRAY[50,100],'customer')`, [customer]);
    const changes = await db.query<{ entity: string; changed_fields: string[] }>(
      `SELECT entity,changed_fields FROM customer_data_changes WHERE customer_id=$1 ORDER BY occurred_at`, [customer]);
    expect(changes.rows.some((row) => row.entity === 'profile')).toBe(true);
    expect(changes.rows.some((row) => row.entity === 'preferences')).toBe(true);
  });
});

describe('anonymous linking and immutable behaviour', () => {
  it('links once without rewriting or duplicating earlier events', async () => {
    const eventId = crypto.randomUUID();
    await asActor('analytics', null,
      `INSERT INTO customer_behavior_events(client_event_id,name,occurred_at,session_id,seller_id,brand_id,product_id,channel)
       VALUES($1,'product_viewed',now(),$2,$3,$4,$5,'web')`, [eventId, session, seller, brand, product]);
    await expect(asActor('analytics', null,
      `INSERT INTO customer_behavior_events(client_event_id,name,occurred_at,session_id,seller_id,brand_id,product_id,channel)
       VALUES($1,'product_viewed',now(),$2,$3,$4,$5,'web')`, [eventId, session, seller, brand, product])).rejects.toThrow();

    const linked = await asActor<{ id: string }>('customer', CUSTOMER_AUTH,
      `SELECT app.link_customer_data_session($1) AS id`, [ANON]);
    expect(linked.rows[0]!.id).toBe(session);
    const retry = await asActor<{ id: string }>('customer', CUSTOMER_AUTH,
      `SELECT app.link_customer_data_session($1) AS id`, [ANON]);
    expect(retry.rows[0]!.id).toBe(session);
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM customer_behavior_events WHERE session_id=$1`, [session])).n).toBe(1);

    await asActor('analytics', null,
      `INSERT INTO customer_behavior_events(client_event_id,name,occurred_at,session_id,seller_id,brand_id,product_id,channel)
       VALUES($1,'wishlisted',now(),$2,$3,$4,$5,'web')`, [crypto.randomUUID(), session, seller, brand, product]);
    expect((await one<{ customer_id: string }>(
      `SELECT customer_id FROM customer_behavior_events WHERE name='wishlisted'`)).customer_id).toBe(customer);
  });

  it('refuses graph mismatches and mutations', async () => {
    await expect(asActor('analytics', null,
      `INSERT INTO customer_behavior_events(client_event_id,name,occurred_at,session_id,seller_id,brand_id,product_id,channel)
       VALUES($1,'cart_added',now(),$2,$3,$4,$5,'web')`,
      [crypto.randomUUID(), session, otherSeller, brand, product])).rejects.toThrow();
    await expect(db.exec(`UPDATE customer_behavior_events SET name='searched'`)).rejects.toThrow('append-only');
    await expect(db.exec(`DELETE FROM customer_behavior_events`)).rejects.toThrow('append-only');
  });
});

describe('tenant and personal-data isolation', () => {
  it('allows a seller to read only events scoped to that seller', async () => {
    const own = await asActor<{ id: string }>('seller', SELLER_AUTH, `SELECT id FROM customer_behavior_events`);
    const other = await asActor<{ id: string }>('seller', OTHER_SELLER_AUTH, `SELECT id FROM customer_behavior_events`);
    expect(own.rows).toHaveLength(2);
    expect(other.rows).toHaveLength(0);
  });

  it('never exposes profiles or preferences to sellers', async () => {
    expect((await asActor('seller', SELLER_AUTH, `SELECT customer_id FROM customer_profiles`)).rows).toEqual([]);
    expect((await asActor('seller', SELLER_AUTH, `SELECT customer_id FROM customer_fragrance_preferences`)).rows).toEqual([]);
  });

  it('keeps consent decisions append-only', async () => {
    await asActor('customer', CUSTOMER_AUTH,
      `INSERT INTO consent_records(customer_id,purpose,granted,source) VALUES($1,'personalization','true','profile')`, [customer]);
    await expect(db.exec(`UPDATE consent_records SET granted='false'`)).rejects.toThrow('append-only');
  });
});
