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
import { applyMigrations } from '../migrate';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const MIGRATIONS = join(import.meta.dirname, '../../migrations');

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
  await applyMigrations(db);

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

  // Delivery details are NOT NULL since 0004 — a house cannot read the parent
  // order, so what it needs to ship is copied onto its own row.
  const DELIVERY = "'أحمد','01009998877','cairo','مدينة نصر','السابع','عباس العقاد','14'";
  ids.ahmedWardSub = (await mk<{ id: string }>(
    `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,
       delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
     VALUES ($1,$2,'DY-90001-A',38000,4500,'seller',${DELIVERY}) RETURNING id`, [ids.ahmedOrder, ids.wardSeller])).id;
  ids.ahmedNourSub = (await mk<{ id: string }>(
    `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,
       delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
     VALUES ($1,$2,'DY-90001-B',45000,5000,'seller',${DELIVERY}) RETURNING id`, [ids.ahmedOrder, ids.nourSeller])).id;

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

  it('a house CAN read the delivery details on its own sub-order', () => within(async () => {
    // Migration 0004. Without this the house can see an order it must pack and
    // has no way to learn where to send it — 0002 promised these details "on
    // the sub-order" and the schema had never provided them.
    const r = await asActor<{ recipient_name: string; city: string }>(
      'seller', ids.wardOwner,
      `SELECT recipient_name, city FROM sub_orders WHERE seller_id = $1`, [ids.wardSeller]);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows[0]!.recipient_name).toBeTruthy();
    expect(r.rows[0]!.city).toBeTruthy();
  }));

  it("cannot read the delivery details on a competitor's sub-order", () => within(async () => {
    // The denormalisation must not have widened access. The row is invisible,
    // so the columns on it are too.
    const r = await asActor(
      'seller', ids.wardOwner,
      `SELECT recipient_name FROM sub_orders WHERE id = $1`, [ids.ahmedNourSub]);
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
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy,
         author_label)
       VALUES ($1,$2,$3,$4,2,2,1,2,3,1,'أحمد ع.')`,
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

/*
 * The aftercare service role (migration 0015).
 *
 * Its whole justification is NARROWNESS: it exists because a guest has no
 * `app.customer_id()` and therefore cannot write the review, return or ticket
 * that guest checkout implies. The comment at the top of 0015 makes a list of
 * claims about what it cannot reach, and a comment making claims about a
 * security boundary is the exact thing this suite exists to stop being taken on
 * trust.
 */
describe('the aftercare role can do its one job, and nothing beside it', () => {
  const AFTERCARE = 'aftercare';

  it('can read the order graph it needs to identify a purchase', () => within(async () => {
    const r = await asActor(AFTERCARE, null,
      `SELECT o.id FROM orders o
       JOIN sub_orders s ON s.order_id = o.id
       JOIN order_line_items li ON li.sub_order_id = s.id
       WHERE o.id = $1`, [ids.ahmedOrder]);
    expect(r.rows.length).toBeGreaterThan(0);
  }));

  it('can append a review for a DELIVERED purchase', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    for (const st of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state=$2 WHERE id=$1`, [ids.ahmedWardSub, st]);
    }
    const li = await db.query<{ id: string }>(
      `SELECT id FROM order_line_items WHERE sub_order_id=$1`, [ids.ahmedWardSub]);

    const written = await asActor(AFTERCARE, null,
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy,
         author_label)
       VALUES ($1,$2,$3,$4,5,4,4,5,5,3,'أحمد ع.') RETURNING id`,
      [ids.ahmedWardSub, li.rows[0]!.id, ids.wardProduct, ids.ahmed]);

    // RETURNING needs the SELECT policy too — the trap 0003 documents and 0015
    // repeats. Without it the write succeeds and reports nothing.
    expect(written.rows).toHaveLength(1);
  }));

  it('CANNOT attribute a review to somebody who did not buy the bottle', () => within(async () => {
    /*
     * The half RLS cannot enforce.
     *
     * `aftercare` IS the authority when it writes, so no policy can ask whether
     * this is the right customer's review. 0015's trigger asks instead — which
     * means a router bug cannot publish a stranger's name under a purchase they
     * never made.
     */
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    for (const st of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state=$2 WHERE id=$1`, [ids.ahmedWardSub, st]);
    }
    const li = await db.query<{ id: string }>(
      `SELECT id FROM order_line_items WHERE sub_order_id=$1`, [ids.ahmedWardSub]);

    await expect(asActor(AFTERCARE, null,
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy,
         author_label)
       VALUES ($1,$2,$3,$4,1,1,1,1,1,1,'أحمد ع.')`,
      // Salma did not place this order.
      [ids.ahmedWardSub, li.rows[0]!.id, ids.wardProduct, ids.salma])).rejects.toThrow();
  }));

  it('CANNOT review a purchase that has not been delivered', () => within(async () => {
    // The same sub-order the case above delivers, left where the fixture put
    // it: `placed`. Every case here runs inside a rollback, so the walk to
    // delivered in the previous test never happened as far as this one is
    // concerned — which is the point of the wrapper.
    const li = await db.query<{ id: string }>(
      `SELECT id FROM order_line_items WHERE sub_order_id=$1`, [ids.ahmedWardSub]);

    await expect(asActor(AFTERCARE, null,
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy,
         author_label)
       VALUES ($1,$2,$3,$4,5,5,5,5,5,5,'أحمد ع.')`,
      [ids.ahmedWardSub, li.rows[0]!.id, ids.wardProduct, ids.ahmed])).rejects.toThrow();
  }));

  it('CANNOT edit or delete a review once written', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    for (const st of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state=$2 WHERE id=$1`, [ids.ahmedWardSub, st]);
    }
    const li = await db.query<{ id: string }>(
      `SELECT id FROM order_line_items WHERE sub_order_id=$1`, [ids.ahmedWardSub]);
    await db.query(
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,rating_packaging,rating_description_accuracy,
         author_label)
       VALUES ($1,$2,$3,$4,2,2,2,2,2,2,'أحمد ع.')`,
      [ids.ahmedWardSub, li.rows[0]!.id, ids.wardProduct, ids.ahmed]);

    // The absence of an UPDATE and a DELETE policy IS the policy. A review is a
    // statement somebody made on a date; rewriting one afterwards is a
    // different feature, and deleting one is what doc 04 §3 forbids outright.
    const edited = await asActor(AFTERCARE, null,
      `UPDATE reviews SET body = 'مكتوب لاحقًا' RETURNING id`);
    expect(edited.rows).toHaveLength(0);

    const deleted = await asActor(AFTERCARE, null, `DELETE FROM reviews RETURNING id`);
    expect(deleted.rows).toHaveLength(0);
  }));

  it('CANNOT reach money, verifications, staff or content', () => within(async () => {
    // Every claim 0015's header makes about what this role cannot touch,
    // executed rather than asserted in a comment.
    for (const table of [
      'payouts', 'payout_lines', 'adjustments', 'commission_overrides',
      'seller_verifications', 'seller_staff', 'platform_staff',
      'content_pages', 'content_revisions', 'audit_log', 'attribution_touches',
    ]) {
      const r = await asActor(AFTERCARE, null, `SELECT * FROM ${table}`);
      expect(r.rows, table).toHaveLength(0);
    }
  }));

  it('CANNOT change an order, a sub-order or a listing', () => within(async () => {
    // It reads the order graph to identify a purchase. Reading is all it does:
    // a role that could move a sub-order could mark somebody's parcel
    // delivered and then review it.
    for (const statement of [
      `UPDATE orders SET contact_name = 'مزيّف' RETURNING id`,
      `UPDATE sub_orders SET state = 'delivered' RETURNING id`,
      `UPDATE products SET price_piastres = 1 RETURNING id`,
      `DELETE FROM order_line_items RETURNING id`,
    ]) {
      const r = await asActor(AFTERCARE, null, statement).catch(() => ({ rows: [] }));
      expect(r.rows, statement).toHaveLength(0);
    }
  }));

  it('CANNOT approve its own return request', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const asked = await db.query<{ id: string }>(
      `INSERT INTO returns (sub_order_id, reason) VALUES ($1,'changed_mind') RETURNING id`,
      [ids.ahmedWardSub]);

    // Asking is the customer's act. Approving one, allocating who bears the
    // cost and setting a refund are not — a customer who could UPDATE this row
    // could approve their own refund.
    const approved = await asActor(AFTERCARE, null,
      `UPDATE returns SET status='approved', refund_piastres=100000 WHERE id=$1 RETURNING id`,
      [asked.rows[0]!.id]);
    expect(approved.rows).toHaveLength(0);
  }));
});

/*
 * The intake service role (migration 0018).
 *
 * Its one job is to let a house apply, and its whole justification is that it
 * cannot do anything else. The header of 0018 makes that claim; these are what
 * make it checkable.
 */
describe('the intake role can create an application, and only an application', () => {
  const INTAKE = 'intake';

  it('can create a house that has APPLIED', () => within(async () => {
    const created = await asActor(INTAKE, null,
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
       VALUES ('دار جديدة','مالكة','01005550001','dar-jadida','applied') RETURNING id`);
    expect(created.rows).toHaveLength(1);
  }));

  it('CANNOT create a house that is already live', () => within(async () => {
    /*
     * The guarantee the whole migration exists for, and it is in the policy's
     * WITH CHECK rather than in the router — so a bug, an injected parameter or
     * a future refactor cannot use this path to put an unvetted house on the
     * shopfront.
     */
    for (const status of ['live', 'approved', 'under_review']) {
      const attempt = await asActor(INTAKE, null,
        `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
         VALUES ('تسلل','مالك','01005550002','sneaky-' || $1, $1::seller_status) RETURNING id`,
        [status]).catch(() => ({ rows: [] }));
      expect(attempt.rows, status).toHaveLength(0);
    }
  }));

  it('CANNOT promote an application it just made', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const seller = await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
       VALUES ('دار منتظرة','مالك','01005550003','dar-waiting','applied') RETURNING id`);

    // No UPDATE policy at all. An applicant cannot edit their application after
    // sending it either, which is deliberate: what an operator reviews has to
    // be what was submitted.
    const promoted = await asActor(INTAKE, null,
      `UPDATE sellers SET status='live' WHERE id=$1 RETURNING id`, [seller.rows[0]!.id]);
    expect(promoted.rows).toHaveLength(0);
  }));

  it('sees live houses only because the PUBLIC policy admits everybody', () => within(async () => {
    /*
     * Not a hole in this role — a property of the whole design, recorded here
     * because an earlier comment in 0018 claimed the opposite and this case is
     * what disproved it.
     *
     * RLS policies are PERMISSIVE and OR'd, so `public_read_live_sellers` from
     * 0002 admits every role to any house that is trading. Postgres has no
     * column-level row security, so `contact_phone` rides along on that row for
     * anonymous traffic too. What protects it is that no public read path
     * selects it, which `sellers-contact-columns.test.ts` asserts.
     */
    const live = await asActor(INTAKE, null, `SELECT id FROM sellers WHERE status = 'live'`);
    const alsoAnon = await asActor('anon', null, `SELECT id FROM sellers WHERE status = 'live'`);
    expect(live.rows.length, 'intake sees exactly what anon sees, and no more')
      .toBe(alsoAnon.rows.length);

    // What IS narrower: it cannot see a house that has been suspended or turned
    // away, which the public policy does not admit either.
    const hidden = await asActor(INTAKE, null,
      `SELECT id FROM sellers WHERE status IN ('suspended','terminated')`);
    expect(hidden.rows).toHaveLength(0);
  }));

  it('CANNOT mark its own verification controls as passed', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const seller = await db.query<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status)
       VALUES ('دار تتحقق','مالك','01005550004','dar-verify','applied') RETURNING id`);

    // The eight controls are seeded by 0001's trigger, which the intake role
    // needs INSERT for. It gets nothing else — it cannot read them and cannot
    // approve them.
    const approved = await asActor(INTAKE, null,
      `UPDATE seller_verifications SET status='approved' WHERE seller_id=$1 RETURNING id`,
      [seller.rows[0]!.id]);
    expect(approved.rows).toHaveLength(0);

    const read = await asActor(INTAKE, null,
      `SELECT id FROM seller_verifications WHERE seller_id=$1`, [seller.rows[0]!.id]);
    expect(read.rows).toHaveLength(0);
  }));

  it('CANNOT reach orders, payouts or customers', () => within(async () => {
    for (const table of ['orders', 'customers', 'payouts', 'sub_orders', 'reviews', 'audit_log']) {
      const r = await asActor(INTAKE, null, `SELECT * FROM ${table}`);
      expect(r.rows, table).toHaveLength(0);
    }
  }));
});

/*
 * A house acting on its own returns (migration 0019).
 *
 * 0002 gave sellers a read policy and nothing else, so every decision button on
 * the returns queue matched zero rows and reported a stale state — a
 * permissions bug wearing a concurrency bug's error message.
 */
describe('a house works its own returns, and cannot touch the money', () => {
  it('can move a return through the physical part of its life', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const asked = await db.query<{ id: string }>(
      `INSERT INTO returns (sub_order_id, reason) VALUES ($1,'defective') RETURNING id`,
      [ids.ahmedWardSub]);

    const moved = await asActor('seller', ids.wardOwner,
      `UPDATE returns SET status='approved' WHERE id=$1 RETURNING id`, [asked.rows[0]!.id]);
    expect(moved.rows, 'a house must be able to answer a return').toHaveLength(1);
  }));

  it('CANNOT set the refund on its own return', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const asked = await db.query<{ id: string }>(
      `INSERT INTO returns (sub_order_id, reason) VALUES ($1,'defective') RETURNING id`,
      [ids.ahmedWardSub]);

    /*
     * RLS binds rows; this is a rule about COLUMNS, so it is a trigger. A house
     * that could write its own refund could close a case without paying
     * anybody — and could equally write a refund of zero.
     */
    await expect(asActor('seller', ids.wardOwner,
      `UPDATE returns SET refund_piastres = 1 WHERE id=$1 RETURNING id`,
      [asked.rows[0]!.id])).rejects.toThrow();
  }));

  it('CANNOT reallocate who bears the cost', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const asked = await db.query<{ id: string }>(
      `INSERT INTO returns (sub_order_id, reason, cost_bearer)
       VALUES ($1,'defective','seller') RETURNING id`,
      [ids.ahmedWardSub]);

    // Doc 06 §7 makes cost allocation follow the reason. A house moving it to
    // `customer` is the house awarding itself the outcome of the dispute.
    await expect(asActor('seller', ids.wardOwner,
      `UPDATE returns SET cost_bearer='customer' WHERE id=$1 RETURNING id`,
      [asked.rows[0]!.id])).rejects.toThrow();
  }));

  it('CANNOT touch another house’s return', () => within(async () => {
    await db.exec(`SET LOCAL app.actor_role='platform'; SET LOCAL app.actor_id='99999999-9999-9999-9999-999999999999';`);
    const asked = await db.query<{ id: string }>(
      `INSERT INTO returns (sub_order_id, reason) VALUES ($1,'defective') RETURNING id`,
      [ids.ahmedNourSub]);

    const stolen = await asActor('seller', ids.wardOwner,
      `UPDATE returns SET status='declined' WHERE id=$1 RETURNING id`, [asked.rows[0]!.id]);
    expect(stolen.rows).toHaveLength(0);
  }));
});

describe('RLS is forced, not merely enabled', () => {
  it('every protected table has FORCE ROW LEVEL SECURITY', async () => {
    const r = await db.query<{ relname: string; relforcerowsecurity: boolean; relrowsecurity: boolean }>(
      // `schema_migrations` is excluded: FORCE binds the table OWNER, and the
      // owner is who writes that row while running a migration with no actor
      // set. Forcing it would make the first migration fail on the statement
      // that records the first migration. `policy-shape.test.ts` proves the
      // application role cannot reach it, which is what actually protects it.
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
         AND relname <> 'schema_migrations'`);
    const unprotected = r.rows.filter((t) => !t.relrowsecurity || !t.relforcerowsecurity);
    expect(unprotected.map((t) => t.relname)).toEqual([]);
  });
});
