/**
 * DB-SAFE-01: seller tenancy does not authorize a different house's brand or
 * certify COD cash. Every adversarial statement drops to app_user, so this
 * exercises the real RLS/constraint boundary rather than a superuser assertion.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';

let db: PGlite;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
let seller: string;
let otherSeller: string;
let brand: string;
let otherBrand: string;
let product: string;
let sub: string;
let otherSub: string;
let shipment: string;

const insertedId = async (statement: string, params: unknown[] = []): Promise<string> =>
  (await db.query<{ id: string }>(statement, params)).rows[0]!.id;

const asActor = async (role: 'seller' | 'platform' | 'checkout', id: string, statement: string, params: unknown[] = []) => {
  await db.query("SELECT set_config('app.actor_role', $1, true), set_config('app.actor_id', $2, true)", [role, id]);
  await db.exec('SET LOCAL ROLE app_user');
  return db.query(statement, params);
};

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec("SET app.actor_role = 'platform'");
  seller = await insertedId("INSERT INTO sellers (trading_name,owner_name,slug,status) VALUES ('A','owner','integrity-a','live') RETURNING id");
  otherSeller = await insertedId("INSERT INTO sellers (trading_name,owner_name,slug,status) VALUES ('B','owner','integrity-b','live') RETURNING id");
  await db.query("INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name) VALUES ($1,$2,'owner','A'),($3,$4,'owner','B')", [seller, OWNER, otherSeller, OTHER]);
  brand = await insertedId("INSERT INTO brands (seller_id,name,slug) VALUES ($1,'A','integrity-brand-a') RETURNING id", [seller]);
  otherBrand = await insertedId("INSERT INTO brands (seller_id,name,slug) VALUES ($1,'B','integrity-brand-b') RETURNING id", [otherSeller]);
  product = await insertedId("INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml) VALUES ($1,$2,'A','integrity-product','A',10000,50) RETURNING id", [seller, brand]);
  const customer = await insertedId("INSERT INTO customers (phone) VALUES ('01012345678') RETURNING id");
  const order = await insertedId(`INSERT INTO orders (reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
    VALUES ('DY-INTEGRITY',$1,'01012345678','Buyer','cairo','City','Area','Street','1','unknown',20000,10000,30000,'cod') RETURNING id`, [customer]);
  for (const [owner, reference] of [[seller, 'DY-INTEGRITY-A'], [otherSeller, 'DY-INTEGRITY-B']] as const) {
    const id = await insertedId(`INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
      VALUES ($1,$2,$3,10000,5000,'seller','Buyer','01012345678','cairo','City','Area','Street','1') RETURNING id`, [order, owner, reference]);
    if (owner === seller) sub = id; else otherSub = id;
  }
  shipment = await insertedId("INSERT INTO shipments (sub_order_id,courier,tracking_number,cod_amount_piastres) VALUES ($1,'manual','OWN-1234',15000) RETURNING id", [sub]);
  await db.exec('RESET app.actor_role');
});
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('a listing belongs to its seller AND its authorized brand', () => {
  it('rejects a seller using another live house’s public brand', async () => {
    await expect(asActor('seller', OWNER, `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
      VALUES ($1,$2,'forged','integrity-forged','FORGED',0,0)`, [seller, otherBrand])).rejects.toThrow();
  });
  it('rejects changing an existing listing to a competitor brand', async () => {
    await expect(asActor('seller', OWNER, 'UPDATE products SET brand_id=$1 WHERE id=$2', [otherBrand, product])).rejects.toThrow();
  });
  it('enforces the same relationship for a platform writer', async () => {
    await expect(asActor('platform', OWNER, 'UPDATE products SET brand_id=$1 WHERE id=$2', [otherBrand, product])).rejects.toThrow();
  });
  it('retains ordinary own-brand creation', async () => {
    const rows = await asActor('seller', OWNER, `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
      VALUES ($1,$2,'own','integrity-own','OWN',0,0) RETURNING id`, [seller, brand]);
    expect(rows.rows).toHaveLength(1);
  });
  it('refuses reassigning a brand behind existing listings', async () => {
    await expect(asActor('platform', OWNER, 'UPDATE brands SET seller_id=$1 WHERE id=$2', [otherSeller, brand])).rejects.toThrow();
  });
});

describe('a house can ship a parcel but cannot certify its money or delivery', () => {
  it.each([
    ['collected amount', 'cod_collected_piastres=15000'],
    ['remittance time', 'cod_remitted_at=now()'],
    ['delivery proof', "proof_of_delivery_ref='self-certified'"],
    ['delivery time', 'delivered_at=now()'],
    ['expected collection amount', 'cod_amount_piastres=0'],
  ])('refuses seller updates to %s', async (_label, change) => {
    await expect(asActor('seller', OWNER, `UPDATE shipments SET ${change} WHERE id=$1`, [shipment])).rejects.toThrow();
  });
  it('refuses creating a pre-remitted shipment', async () => {
    await expect(asActor('seller', OWNER, `INSERT INTO shipments (sub_order_id,courier,tracking_number,cod_amount_piastres,cod_collected_piastres,cod_remitted_at)
      VALUES ($1,'manual','FORGED-1234',15000,15000,now())`, [sub])).rejects.toThrow();
  });
  it('refuses deleting a shipment and its financial evidence', async () => {
    await expect(asActor('seller', OWNER, 'DELETE FROM shipments WHERE id=$1', [shipment])).rejects.toThrow();
  });
  it('refuses attaching an existing shipment to another seller’s sub-order', async () => {
    await expect(asActor('seller', OWNER, 'UPDATE shipments SET sub_order_id=$1 WHERE id=$2', [otherSub, shipment])).rejects.toThrow();
  });
  it('retains manual dispatch insertion with its expected COD amount', async () => {
    const rows = await asActor('seller', OWNER, `INSERT INTO shipments (sub_order_id,courier,tracking_number,cod_amount_piastres,dispatched_at)
      VALUES ($1,'manual','NEW-1234',15000,now()) RETURNING id`, [sub]);
    expect(rows.rows).toHaveLength(1);
  });
  it('retains seller corrections to tracking details', async () => {
    const rows = await asActor('seller', OWNER, "UPDATE shipments SET tracking_number='CORRECT-1234' WHERE id=$1 RETURNING id", [shipment]);
    expect(rows.rows).toHaveLength(1);
  });
  it('retains the platform remittance and delivery-evidence workflow', async () => {
    const rows = await asActor('platform', OWNER, `UPDATE shipments SET cod_collected_piastres=15000,cod_remitted_at=now(),
      proof_of_delivery_ref='courier-proof',delivered_at=now() WHERE id=$1 RETURNING id`, [shipment]);
    expect(rows.rows).toHaveLength(1);
  });
  it('still hides another seller’s shipment from an attacker', async () => {
    const rows = await asActor('seller', OTHER, 'UPDATE shipments SET cod_collected_piastres=1 WHERE id=$1 RETURNING id', [shipment]);
    expect(rows.rows).toHaveLength(0);
  });
});


// Focused database-only regressions for F22 and relational tenant integrity.
const lineFor = (ownerSub: string, ownerProduct: string) => insertedId(`INSERT INTO order_line_items
  (sub_order_id,product_id,product_name,brand_name,sku,volume_ml,quantity,unit_price_piastres,
   line_piastres,commission_source,commission_bps,commission_rule_set_version,commission_piastres)
  VALUES ($1,$2,'Original','A','A',50,1,10000,10000,'unknown',500,1,500) RETURNING id`, [ownerSub, ownerProduct]);
const competitorProduct = () => insertedId(`INSERT INTO products(seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
  VALUES ($1,$2,'B','integrity-product-b','B',10000,50) RETURNING id`, [otherSeller, otherBrand]);
const deliver = async (id: string) => {
  for (const state of ['awaiting_seller','confirmed','dispatched','delivered']) {
    await db.query('UPDATE sub_orders SET state=$1 WHERE id=$2', [state, id]);
  }
};
describe('database-generated product history', () => {
  it('snapshots price/stock/notes and actor atomically without repricing old order lines', async () => {
    const line = await lineFor(sub, product);
    await asActor('seller', OWNER, "UPDATE products SET price_piastres=12000,stock=4,notes_top=ARRAY['rose'] WHERE id=$1", [product]);
    const rows = await db.query<{ changed_by: string; changed_fields: string[]; before: string; after: string }>(
      'SELECT changed_by,changed_fields,before,after FROM product_revisions WHERE product_id=$1', [product]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.changed_by).toBe(OWNER);
    expect(rows.rows[0]!.changed_fields).toEqual(['notes_top','price_piastres','stock']);
    expect(JSON.parse(rows.rows[0]!.before).price_piastres).toBe(10000);
    expect(JSON.parse(rows.rows[0]!.after).price_piastres).toBe(12000);
    expect((await db.query<{ unit_price_piastres: number }>('SELECT unit_price_piastres FROM order_line_items WHERE id=$1', [line])).rows[0]!.unit_price_piastres).toBe(10000);
    await db.query('UPDATE products SET price_piastres=12000,stock=4 WHERE id=$1', [product]);
    expect((await db.query('SELECT id FROM product_revisions WHERE product_id=$1', [product])).rows).toHaveLength(1);
  });
  it('does not snapshot technical bookkeeping or copy private evidence values', async () => {
    await asActor('seller', OWNER, "UPDATE products SET search_text='refolded',updated_at=now() WHERE id=$1", [product]);
    expect((await db.query('SELECT id FROM product_revisions WHERE product_id=$1', [product])).rows).toHaveLength(0);
    await db.query("UPDATE products SET evidence_refs=ARRAY['synthetic-secret-evidence'] WHERE id=$1", [product]);
    const row = (await db.query<{ before: string; after: string }>('SELECT before,after FROM product_revisions WHERE product_id=$1', [product])).rows[0]!;
    expect(row.after).not.toContain('synthetic-secret-evidence');
    expect(JSON.parse(row.after).evidence_refs).toEqual({ redacted: true });
  });
  it('rolls history back with the product change and refuses invalid stock', async () => {
    await db.exec('SAVEPOINT changed');
    await asActor('seller', OWNER, 'UPDATE products SET stock=5 WHERE id=$1', [product]);
    await db.exec('ROLLBACK TO SAVEPOINT changed');
    expect((await db.query('SELECT id FROM product_revisions WHERE product_id=$1', [product])).rows).toHaveLength(0);
    await db.exec('SAVEPOINT invalid');
    await expect(asActor('seller', OWNER, 'UPDATE products SET stock=-1 WHERE id=$1', [product])).rejects.toThrow();
    await db.exec('ROLLBACK TO SAVEPOINT invalid');
    expect((await db.query('SELECT id FROM product_revisions WHERE product_id=$1', [product])).rows).toHaveLength(0);
  });
  it('rejects fabricated history even from the platform application role', async () => {
    await expect(asActor('platform', OWNER, `INSERT INTO product_revisions(product_id,changed_fields,before,after)
      VALUES ($1,ARRAY['price_piastres'],'{}','{}')`, [product])).rejects.toThrow();
  });
});
describe('permanent tenant-consistent data links', () => {
  it('rejects a competitor product inside an own-house sub-order', async () => {
    await expect(lineFor(sub, await competitorProduct())).rejects.toThrow();
  });
  it('rejects product reassignment behind historical order lines', async () => {
    await lineFor(sub, product);
    await expect(db.query('UPDATE products SET seller_id=$1,brand_id=$2 WHERE id=$3', [otherSeller, otherBrand, product])).rejects.toThrow();
  });
  it('rejects sub-order reassignment behind historical order lines', async () => {
    await lineFor(sub, product);
    await expect(db.query('UPDATE sub_orders SET seller_id=$1 WHERE id=$2', [otherSeller, sub])).rejects.toThrow();
  });
  it('a return prevents its referenced line moving to another sub-order', async () => {
    const line = await lineFor(sub, product);
    const other = await competitorProduct();
    await db.query("INSERT INTO returns(sub_order_id,line_item_id,reason) VALUES ($1,$2,'defective')", [sub, line]);
    await expect(db.query('UPDATE order_line_items SET sub_order_id=$1,product_id=$2 WHERE id=$3', [otherSub, other, line])).rejects.toThrow();
  });
  it('rejects a cross-house statement line', async () => {
    await deliver(otherSub);
    const payout = await insertedId(`INSERT INTO payouts(seller_id,reference,period_start,period_end)
      VALUES ($1,'P-INTEGRITY',now(),now()) RETURNING id`, [seller]);
    await expect(db.query(`INSERT INTO payout_lines(payout_id,sub_order_id,gross_piastres,commission_piastres,
      commission_source,commission_bps,shipping_piastres,net_piastres) VALUES ($1,$2,0,0,'unknown',500,0,0)`, [payout, otherSub])).rejects.toThrow();
  });
  it('retains valid statement lines and refuses parent ownership changes', async () => {
    await deliver(sub);
    const payout = await insertedId(`INSERT INTO payouts(seller_id,reference,period_start,period_end)
      VALUES ($1,'P-INTEGRITY',now(),now()) RETURNING id`, [seller]);
    await db.query(`INSERT INTO payout_lines(payout_id,sub_order_id,gross_piastres,commission_piastres,
      commission_source,commission_bps,shipping_piastres,net_piastres) VALUES ($1,$2,0,0,'unknown',500,0,0)`, [payout, sub]);
    await expect(db.query('UPDATE payouts SET seller_id=$1 WHERE id=$2', [otherSeller, payout])).rejects.toThrow();
  });
});


describe('tenant integrity preserves the restricted checkout service', () => {
  it('creates an ordinary checkout line without adding product UPDATE privileges', async () => {
    await asActor('platform', OWNER, `UPDATE products SET
      concentration='eau_de_parfum',form='spray',gender_positioning='unisex',scent_family='oud',
      notes_top=ARRAY['rose'],notes_heart=ARRAY['rose'],notes_base=ARRAY['oud'],
      seasons=ARRAY['winter']::season[],day_night='night',occasions=ARRAY['evening']::occasion[],
      projection_band='moderate',longevity_band='long',performance_source='seller_provided',responsible_party_name='Test',
      return_eligibility='sealed_only',defect_route='Inspected replacement' WHERE id=$1`, [product]);
    await db.query(`INSERT INTO product_media(product_id,storage_path,alt_text,is_primary,ownership_confirmed,
      content_type,byte_size,width,height) VALUES ($1,'media/test.jpg','Test',true,true,'image/jpeg',1000,100,100)`, [product]);
    await db.query("UPDATE products SET status='published' WHERE id=$1", [product]);
    await asActor('checkout', '', 'SELECT id FROM products WHERE id=$1', [product]);
    expect(await lineFor(sub, product)).toBeTruthy();
    expect((await db.query('UPDATE products SET stock=1 WHERE id=$1 RETURNING id', [product])).rows).toHaveLength(0);
  });
});
