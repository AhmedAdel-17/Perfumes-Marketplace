/**
 * Row-Level Security proofs.
 *
 * ENGINEERING_PRINCIPLES §5: "A seller must provably be unable to read another
 * seller's data." Provably means a test that attempts the read and gets nothing.
 *
 * Every case below is executed against a real Postgres with FORCE ROW LEVEL
 * SECURITY on, so the policies bind even the table owner.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const MIGRATIONS = join(import.meta.dirname, '../../migrations');

const runSql = async (f: string) =>
  db.exec(readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--> statement-breakpoint/g, ''));

/** Run a query as a given actor. This is what an authenticated request looks like. */
const asActor = async <T>(role: string, actorId: string | null, sql: string, params: unknown[] = []) => {
  // GUCs first, then drop to the unprivileged role — RLS does not bind a superuser.
  await db.exec(`SET LOCAL app.actor_role = '${role}'`);
  await db.exec(`SET LOCAL app.actor_id = '${actorId ?? ''}'`);
  await db.exec(`SET LOCAL ROLE app_user`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    // A refused write aborts the transaction, which would make RESET ROLE throw
    // and mask the real rejection. The surrounding rollback restores the role.
    await db.exec(`RESET ROLE`).catch(() => undefined);
  }
};

/** Wrap in a transaction so SET LOCAL is scoped and cannot leak between cases. */
const within = async <T>(fn: () => Promise<T>): Promise<T> => {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
};

const ids = {
  wardSeller: '', nourSeller: '',
  wardOwner: '11111111-1111-1111-1111-111111111111',
  wardClerk: '22222222-2222-2222-2222-222222222222',
  nourOwner: '33333333-3333-3333-3333-333333333333',
  ahmedAuth: '44444444-4444-4444-4444-444444444444',
  salmaAuth: '55555555-5555-5555-5555-555555555555',
  ahmed: '', salma: '',
  wardProduct: '', nourProduct: '',
  ahmedOrder: '', ahmedWardSub: '', ahmedNourSub: '',
  wardPayout: '',
};

beforeAll(async () => {
  db = new PGlite();
  await runSql('0000_initial.sql');
  await runSql('0001_constraints.sql');
  await runSql('0002_rls.sql');
  await runSql('0003_checkout.sql');

  // Seed as platform, which is the only role that may create this much.
  await db.exec(`SET app.actor_role = 'platform'; SET app.actor_id = '99999999-9999-9999-9999-999999999999';`);

  const mk = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;

  ids.wardSeller = (await mk<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
     VALUES ('دار الورد','خالد','01001234567','dar-al-ward','live') RETURNING id`)).id;
  ids.nourSeller = (await mk<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
     VALUES ('ميزون نور','نور','01007654321','maison-nour','live') RETURNING id`)).id;

  await db.query(
    `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name) VALUES
      ($1,$2,'owner','خالد'), ($1,$3,'fulfilment','عامل التغليف'), ($4,$5,'owner','نور')`,
    [ids.wardSeller, ids.wardOwner, ids.wardClerk, ids.nourSeller, ids.nourOwner]);

  ids.ahmed = (await mk<{ id: string }>(
    `INSERT INTO customers (phone, full_name, auth_user_id) VALUES ('01009998877','أحمد',$1) RETURNING id`,
    [ids.ahmedAuth])).id;
  ids.salma = (await mk<{ id: string }>(
    `INSERT INTO customers (phone, full_name, auth_user_id) VALUES ('01112223344','سلمى',$1) RETURNING id`,
    [ids.salmaAuth])).id;

  const wardBrand = (await mk<{ id: string }>(
    `INSERT INTO brands (seller_id,name,slug) VALUES ($1,'دار الورد','b-ward') RETURNING id`,
    [ids.wardSeller])).id;
  const nourBrand = (await mk<{ id: string }>(
    `INSERT INTO brands (seller_id,name,slug) VALUES ($1,'ميزون نور','b-nour') RETURNING id`,
    [ids.nourSeller])).id;

  ids.wardProduct = (await mk<{ id: string }>(
    `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
     VALUES ($1,$2,'ورد الطائف','ward-taif','WRD-30',38000,30) RETURNING id`,
    [ids.wardSeller, wardBrand])).id;
  ids.nourProduct = (await mk<{ id: string }>(
    `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
     VALUES ($1,$2,'ليل القاهرة','layl-cairo','NUR-50',45000,50) RETURNING id`,
    [ids.nourSeller, nourBrand])).id;

  // One order spanning BOTH houses — the isolation case that matters.
  ids.ahmedOrder = (await mk<{ id: string }>(
    `INSERT INTO orders (reference,customer_id,contact_phone,contact_name,governorate,city,area,street,building,
       source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
     VALUES ('DY-90001',$1,'01009998877','أحمد','cairo','مدينة نصر','السابع','عباس العقاد','14',
       'storefront_referral',83000,9500,92500,'cod') RETURNING id`, [ids.ahmed])).id;

  ids.ahmedWardSub = (await mk<{ id: string }>(
    `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres)
     VALUES ($1,$2,'DY-90001-A',38000,4500) RETURNING id`, [ids.ahmedOrder, ids.wardSeller])).id;
  ids.ahmedNourSub = (await mk<{ id: string }>(
    `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres)
     VALUES ($1,$2,'DY-90001-B',45000,5000) RETURNING id`, [ids.ahmedOrder, ids.nourSeller])).id;

  await db.query(
    `INSERT INTO order_line_items (sub_order_id,product_id,product_name,brand_name,sku,volume_ml,
       quantity,unit_price_piastres,line_piastres,commission_source,commission_bps,
       commission_rule_set_version,commission_piastres)
     VALUES ($1,$2,'ورد الطائف','دار الورد','WRD-30',30,1,38000,38000,'storefront_referral',500,1,1900)`,
    [ids.ahmedWardSub, ids.wardProduct]);

  ids.wardPayout = (await mk<{ id: string }>(
    `INSERT INTO payouts (seller_id,reference,period_start,period_end,net_piastres)
     VALUES ($1,'PO-1',now(),now(),377900) RETURNING id`, [ids.wardSeller])).id;

  await db.exec(`RESET app.actor_role; RESET app.actor_id;`);
}, 180_000);

afterAll(async () => { await db?.close(); });

describe('seller isolation — the rule the marketplace depends on', () => {
  it('a house sees only its own sub-orders', () => within(async () => {
    const r = await asActor<{ reference: string }>('seller', ids.wardOwner, `SELECT reference FROM sub_orders`);
    expect(r.rows.map((x) => x.reference)).toEqual(['DY-90001-A']);
  }));

  it("a house cannot read a competitor's sub-order even by id", () => within(async () => {
    const r = await asActor('seller', ids.wardOwner, `SELECT * FROM sub_orders WHERE id = $1`, [ids.ahmedNourSub]);
    expect(r.rows).toHaveLength(0);
  }));

  it('a house cannot read the PARENT order — it would expose the competitor', () => within(async () => {
    const r = await asActor('seller', ids.wardOwner, `SELECT * FROM orders`);
    expect(r.rows).toHaveLength(0);
  }));

  it("a house cannot read a competitor's line items", () => within(async () => {
    const r = await asActor('seller', ids.nourOwner, `SELECT * FROM order_line_items`);
    expect(r.rows).toHaveLength(0);
  }));

  it("a house cannot UPDATE a competitor's sub-order", () => within(async () => {
    const r = await asActor('seller', ids.wardOwner,
      `UPDATE sub_orders SET state='confirmed' WHERE id=$1 RETURNING id`, [ids.ahmedNourSub]);
    expect(r.rows).toHaveLength(0);
  }));

  it("a house cannot edit a competitor's product", () => within(async () => {
    const r = await asActor('seller', ids.wardOwner,
      `UPDATE products SET price_piastres = 1 WHERE id=$1 RETURNING id`, [ids.nourProduct]);
    expect(r.rows).toHaveLength(0);
  }));

  it('a house cannot read the customer record behind an order', () => within(async () => {
    const r = await asActor('seller', ids.wardOwner, `SELECT * FROM customers`);
    expect(r.rows).toHaveLength(0);
  }));

  it("a house cannot read the customer's browsing trail", () => within(async () => {
    const r = await asActor('seller', ids.wardOwner, `SELECT * FROM attribution_touches`);
    expect(r.rows).toHaveLength(0);
  }));
});

describe('staff roles — staff must not see what owners see', () => {
  it('an owner reads the payout', () => within(async () => {
    const r = await asActor('seller', ids.wardOwner, `SELECT reference FROM payouts`);
    expect(r.rows).toHaveLength(1);
  }));

  it('a fulfilment clerk cannot — money is owner-only', () => within(async () => {
    const r = await asActor('seller', ids.wardClerk, `SELECT reference FROM payouts`);
    expect(r.rows).toHaveLength(0);
  }));

  it('a clerk still sees the orders they must pack', () => within(async () => {
    const r = await asActor('seller', ids.wardClerk, `SELECT reference FROM sub_orders`);
    expect(r.rows).toHaveLength(1);
  }));

  it('a clerk cannot add staff to the house', () => within(async () => {
    // A WITH CHECK violation raises rather than returning zero rows, and it
    // aborts the transaction — so the assertion has to be on the raised error.
    let refused = '';
    try {
      await asActor('seller', ids.wardClerk,
        `INSERT INTO seller_staff (seller_id, auth_user_id, role, full_name)
         VALUES ($1, gen_random_uuid(), 'owner', 'staff') RETURNING id`, [ids.wardSeller]);
    } catch (e) {
      refused = (e as Error).message;
    }
    expect(refused).toMatch(/row-level security/i);
  }));

  it('a clerk cannot change the house profile', () => within(async () => {
    const r = await asActor('seller', ids.wardClerk,
      `UPDATE sellers SET trading_name='x' WHERE id=$1 RETURNING id`, [ids.wardSeller]);
    expect(r.rows).toHaveLength(0);
  }));

  it('a revoked staff member sees nothing', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    await db.query(`UPDATE seller_staff SET revoked_at = now() WHERE auth_user_id = $1`, [ids.wardClerk]);
    const r = await asActor('seller', ids.wardClerk, `SELECT reference FROM sub_orders`);
    expect(r.rows).toHaveLength(0);
  }));
});

describe('customer isolation — one account, one relationship', () => {
  it('a customer sees their own order across all houses', () => within(async () => {
    const r = await asActor<{ reference: string }>('customer', ids.ahmedAuth, `SELECT reference FROM orders`);
    expect(r.rows.map((x) => x.reference)).toEqual(['DY-90001']);
  }));

  it('and both sub-orders under it — one tracking surface', () => within(async () => {
    const r = await asActor('customer', ids.ahmedAuth, `SELECT reference FROM sub_orders`);
    expect(r.rows).toHaveLength(2);
  }));

  it("a customer cannot read another customer's order", () => within(async () => {
    const r = await asActor('customer', ids.salmaAuth, `SELECT reference FROM orders`);
    expect(r.rows).toHaveLength(0);
  }));

  it("a customer cannot read another customer's record", () => within(async () => {
    const r = await asActor<{ full_name: string }>('customer', ids.salmaAuth, `SELECT full_name FROM customers`);
    expect(r.rows.map((x) => x.full_name)).toEqual(['سلمى']);
  }));

  it('a customer cannot see any payout', () => within(async () => {
    const r = await asActor('customer', ids.ahmedAuth, `SELECT * FROM payouts`);
    expect(r.rows).toHaveLength(0);
  }));
});

describe('anonymous visitors — the SEO surface, and nothing more', () => {
  it('read live houses and published listings', () => within(async () => {
    const s = await asActor('anon', null, `SELECT slug FROM sellers`);
    expect(s.rows).toHaveLength(2);
  }));

  it('cannot see unpublished listings', () => within(async () => {
    const p = await asActor('anon', null, `SELECT slug FROM products`);
    expect(p.rows).toHaveLength(0);           // both seeded as draft
  }));

  it('cannot see orders, customers or payouts', () => within(async () => {
    for (const t of ['orders', 'customers', 'payouts', 'sub_orders', 'audit_log']) {
      const r = await asActor('anon', null, `SELECT * FROM ${t}`);
      expect(r.rows, t).toHaveLength(0);
    }
  }));
});

describe('reviews — a house cannot suppress criticism', () => {
  it('no actor but the platform may delete a review', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    for (const st of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state=$2 WHERE id=$1`, [ids.ahmedWardSub, st]);
    }
    const li = await db.query<{ id: string }>(
      `SELECT id FROM order_line_items WHERE sub_order_id=$1`, [ids.ahmedWardSub]);
    await db.query(
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy)
       VALUES ($1,$2,$3,$4,2,2,1,2,3,1)`,
      [ids.ahmedWardSub, li.rows[0]!.id, ids.wardProduct, ids.ahmed]);

    // the house tries to delete the bad review
    const del = await asActor('seller', ids.wardOwner, `DELETE FROM reviews RETURNING id`);
    expect(del.rows).toHaveLength(0);

    // and tries to hide it
    const hide = await asActor('seller', ids.wardOwner, `UPDATE reviews SET hidden_at = now() RETURNING id`);
    expect(hide.rows).toHaveLength(0);

    // it is still publicly visible
    const pub = await asActor('anon', null, `SELECT id FROM reviews`);
    expect(pub.rows).toHaveLength(1);
  }));
});

describe('the audit trail is platform-only', () => {
  it('no seller or customer can read it', () => within(async () => {
    for (const [role, id] of [['seller', ids.wardOwner], ['customer', ids.ahmedAuth], ['anon', null]] as const) {
      const r = await asActor(role, id, `SELECT * FROM audit_log`);
      expect(r.rows, role).toHaveLength(0);
    }
  }));
});

describe('RLS is forced, not merely enabled', () => {
  it('every protected table has FORCE ROW LEVEL SECURITY', async () => {
    const r = await db.query<{ relname: string; relforcerowsecurity: boolean; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`);
    const unprotected = r.rows.filter((t) => !t.relrowsecurity || !t.relforcerowsecurity);
    expect(unprotected.map((t) => t.relname)).toEqual([]);
  });
});
