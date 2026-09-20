/**
 * Acceptance-gate tests, executed against a real Postgres.
 *
 * These run the actual migrations in an embedded Postgres (PGlite) and then try
 * to break the rules the founding pack says must hold. ENGINEERING_PRINCIPLES §5
 * requires money paths to be tested; these are the rules the money paths rest on.
 *
 * A rule enforced only in the UI is not enforced, so every assertion here is a
 * write the database must REFUSE.
 *
 * EVERY MIGRATION, not the two that first wrote these gates. The file used to
 * apply 0000 and 0001 only, which meant it asserted acceptance gate 5 against a
 * trigger function that 0015 has since replaced — the assertions passed and the
 * code they described was no longer the code that runs. A test pinned to an old
 * snapshot of the schema stops being a test of the schema.
 *
 * It writes as a platform operator because 0002 turns RLS on with FORCE, which
 * binds the table owner too; without an actor every seeding write here would be
 * refused for a reason that has nothing to do with the gate being tested.
 */
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';

/** Expect a write to be refused, and return the message so we can assert on it. */
const refuses = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected the database to refuse this write, but it succeeded');
};

let sellerId: string;
let brandId: string;
let customerId: string;

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const seller = await db.query<{ id: string }>(
    `INSERT INTO sellers (trading_name, owner_name, slug)
     VALUES ('دار الورد', 'خالد', 'dar-al-ward') RETURNING id`,
  );
  sellerId = seller.rows[0]!.id;

  const brand = await db.query<{ id: string }>(
    `INSERT INTO brands (seller_id, name, slug) VALUES ($1, 'دار الورد', 'dar-al-ward-brand') RETURNING id`,
    [sellerId],
  );
  brandId = brand.rows[0]!.id;

  const customer = await db.query<{ id: string }>(
    `INSERT INTO customers (phone, full_name) VALUES ('01009998877', 'أحمد') RETURNING id`,
  );
  customerId = customer.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations', () => {
  it('apply cleanly to an empty Postgres', async () => {
    const t = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(t.rows[0]!.count).toBeGreaterThanOrEqual(25);
  });

  it('store money as integers, never floating point', async () => {
    const cols = await db.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name LIKE '%piastres%'`,
    );
    expect(cols.rows.length).toBeGreaterThan(15);
    for (const c of cols.rows) expect(c.data_type).toBe('integer');
  });
});

describe('seller onboarding — there is no self-approval path', () => {
  it('seeds all eight verification controls on application', async () => {
    const r = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM seller_verifications WHERE seller_id = $1`,
      [sellerId],
    );
    expect(r.rows[0]!.count).toBe(8);
  });

  it('refuses to make a seller live with an incomplete checklist', async () => {
    const msg = await refuses(() =>
      db.query(`UPDATE sellers SET status = 'live' WHERE id = $1`, [sellerId]),
    );
    expect(msg).toMatch(/incomplete checklist/i);
    expect(msg).toMatch(/0 of 8/);
  });

  it('allows approval only once every control passes', async () => {
    await db.query(`UPDATE seller_verifications SET status = 'approved' WHERE seller_id = $1`, [sellerId]);
    await db.query(`UPDATE sellers SET status = 'approved' WHERE id = $1`, [sellerId]);
    const r = await db.query<{ status: string }>(`SELECT status FROM sellers WHERE id = $1`, [sellerId]);
    expect(r.rows[0]!.status).toBe('approved');
  });
});

describe('publish gate — no listing publishes with missing required fields', () => {
  const draft = async (over = '') =>
    db.query<{ id: string }>(
      `INSERT INTO products (seller_id, brand_id, name, slug, sku, price_piastres, volume_ml ${over ? ',' + over.split('=')[0] : ''})
       VALUES ($1, $2, 'ورد الطائف', 'ward-' || gen_random_uuid(), 'SKU-' || substr(gen_random_uuid()::text,1,8), 38000, 30
       ${over ? ",'" + over.split('=')[1] + "'" : ''}) RETURNING id`,
      [sellerId, brandId],
    );

  it('accepts an incomplete DRAFT — drafts are allowed to be unfinished', async () => {
    const r = await draft();
    expect(r.rows[0]!.id).toBeTruthy();
  });

  it('refuses to publish it, and names every missing field', async () => {
    const r = await draft();
    const msg = await refuses(() =>
      db.query(`UPDATE products SET status = 'published' WHERE id = $1`, [r.rows[0]!.id]),
    );
    expect(msg).toMatch(/Cannot publish/);
    for (const field of [
      'concentration', 'scent_family', 'notes_top', 'notes_heart', 'notes_base',
      'seasons', 'occasions', 'projection_band', 'longevity_band',
      'responsible_party_name', 'return_eligibility', 'defect_route',
      'primary_image_with_confirmed_ownership_and_alt_text',
    ]) {
      expect(msg).toContain(field);
    }
  });

  it('refuses a performance band whose source is undisclosed', async () => {
    const r = await draft();
    const id = r.rows[0]!.id;
    await db.query(
      `UPDATE products SET concentration='eau_de_parfum', form='spray', gender_positioning='women',
         scent_family='floral', notes_top=ARRAY['برغموت'], notes_heart=ARRAY['ورد'], notes_base=ARRAY['مسك'],
         seasons=ARRAY['spring']::season[], occasions=ARRAY['daily']::occasion[], day_night='both',
         projection_band='moderate', longevity_band='long',
         responsible_party_name='دار الورد', return_eligibility='sealed_only', defect_route='استلام من العميل'
       WHERE id = $1`,
      [id],
    );
    const msg = await refuses(() =>
      db.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]),
    );
    // performance_source is missing; a seller claim must not pass as platform fact
    expect(msg).toContain('performance_source');
  });

  it('publishes once every group is complete, including confirmed image ownership', async () => {
    const r = await draft();
    const id = r.rows[0]!.id;
    await db.query(
      `UPDATE products SET concentration='eau_de_parfum', form='spray', gender_positioning='women',
         scent_family='floral', notes_top=ARRAY['برغموت'], notes_heart=ARRAY['ورد'], notes_base=ARRAY['مسك'],
         seasons=ARRAY['spring']::season[], occasions=ARRAY['daily']::occasion[], day_night='both',
         projection_band='moderate', longevity_band='long', performance_source='seller_provided',
         responsible_party_name='دار الورد', return_eligibility='sealed_only', defect_route='استلام من العميل'
       WHERE id = $1`,
      [id],
    );

    // still refused: no primary image with confirmed ownership
    const msg = await refuses(() =>
      db.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]),
    );
    expect(msg).toContain('primary_image');

    /*
     * A row is not a photograph (0024).
     *
     * This used to insert exactly the row below and publish. QA found what that
     * allowed: a published perfume whose own editor said the image could not be
     * displayed, because the storefront renders only rows carrying the facts the
     * server read from the file (0021) — and the gate never asked for them.
     */
    await db.query(
      `INSERT INTO product_media (product_id, storage_path, alt_text, is_primary, ownership_confirmed)
       VALUES ($1, 'products/00000000-0000-4000-8000-000000000000/aaaaaaaaaaaaaaaaaaaaaaaa.jpg',
               'زجاجة ورد الطائف', true, true)`,
      [id],
    );
    const stillRefused = await refuses(() =>
      db.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]),
    );
    expect(stillRefused).toContain('primary_image');

    // The same row, once the server has actually read the file.
    await db.query(
      `UPDATE product_media SET content_type='image/jpeg', byte_size=180000, width=1000, height=1250
       WHERE product_id = $1`,
      [id],
    );
    await db.query(`UPDATE products SET status = 'published' WHERE id = $1`, [id]);
    const out = await db.query<{ status: string }>(`SELECT status FROM products WHERE id = $1`, [id]);
    expect(out.rows[0]!.status).toBe('published');
  });

  it('refuses a promotional price above the list price', async () => {
    const r = await draft();
    const msg = await refuses(() =>
      db.query(`UPDATE products SET promo_price_piastres = 99000 WHERE id = $1`, [r.rows[0]!.id]),
    );
    expect(msg).toMatch(/products_promo_valid/);
  });
});

describe('orders — the money must reconcile', () => {
  const newOrder = (merch: number, ship: number, discount: number, total: number) =>
    db.query<{ id: string }>(
      `INSERT INTO orders (reference, customer_id, contact_phone, contact_name,
         governorate, city, area, street, building, source,
         merchandise_piastres, shipping_piastres, discount_piastres, total_piastres, payment_method)
       VALUES ('DY-' || substr(gen_random_uuid()::text,1,8), $1, '01009998877', 'أحمد',
         'cairo', 'مدينة نصر', 'الحي السابع', 'عباس العقاد', '14', 'storefront_referral',
         $2, $3, $4, $5, 'cod') RETURNING id`,
      [customerId, merch, ship, discount, total],
    );

  it('accepts an order whose total reconciles', async () => {
    const r = await newOrder(219_000, 13_500, 0, 232_500);
    expect(r.rows[0]!.id).toBeTruthy();
  });

  it('refuses an order whose total does not', async () => {
    const msg = await refuses(() => newOrder(219_000, 13_500, 0, 999_999));
    expect(msg).toMatch(/orders_total_reconciles/);
  });

  it('refuses an order with no attributed source', async () => {
    const msg = await refuses(() =>
      db.query(
        `INSERT INTO orders (reference, customer_id, contact_phone, contact_name,
           governorate, city, area, street, building,
           merchandise_piastres, shipping_piastres, total_piastres, payment_method)
         VALUES ('DY-NOSRC', $1, '01009998877', 'أحمد', 'cairo', 'x', 'y', 'z', '1', 100, 0, 100, 'cod')`,
        [customerId],
      ),
    );
    expect(msg).toMatch(/source/);
  });

  it('refuses a malformed Egyptian phone number', async () => {
    const msg = await refuses(() =>
      db.query(`INSERT INTO customers (phone) VALUES ('12345')`),
    );
    expect(msg).toMatch(/customers_phone_shape/);
  });
});

describe('sub-orders — the state machine is enforced in the database too', () => {
  const newSubOrder = async () => {
    const o = await db.query<{ id: string }>(
      `INSERT INTO orders (reference, customer_id, contact_phone, contact_name,
         governorate, city, area, street, building, source,
         merchandise_piastres, shipping_piastres, total_piastres, payment_method)
       VALUES ('DY-' || substr(gen_random_uuid()::text,1,8), $1, '01009998877', 'أحمد',
         'cairo', 'x', 'y', 'z', '1', 'organic_search', 38000, 4500, 42500, 'cod') RETURNING id`,
      [customerId],
    );
    const s = await db.query<{ id: string }>(
      // The delivery details are NOT NULL since 0004: a house cannot read the
      // parent order, so what it needs to ship lives on its own row. The
      // fixture predated that migration and had never been told.
      `INSERT INTO sub_orders (order_id, seller_id, reference, merchandise_piastres, shipping_piastres,
         delivery_fulfilled_by, recipient_name, recipient_phone,
         governorate, city, area, street, building)
       VALUES ($1, $2, 'DY-' || substr(gen_random_uuid()::text,1,8) || '-A', 38000, 4500,
         'seller', 'أحمد', '01009998877', 'cairo', 'مدينة نصر', 'السابع', 'عباس', '14') RETURNING id`,
      [o.rows[0]!.id, sellerId],
    );
    return s.rows[0]!.id;
  };

  it('refuses to skip seller confirmation', async () => {
    const id = await newSubOrder();
    await db.query(`UPDATE sub_orders SET state = 'awaiting_seller' WHERE id = $1`, [id]);
    const msg = await refuses(() =>
      db.query(`UPDATE sub_orders SET state = 'dispatched' WHERE id = $1`, [id]),
    );
    expect(msg).toMatch(/Illegal sub-order transition: awaiting_seller → dispatched/);
  });

  it('refuses to reverse a delivery back into transit', async () => {
    const id = await newSubOrder();
    for (const s of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state = $2 WHERE id = $1`, [id, s]);
    }
    const msg = await refuses(() =>
      db.query(`UPDATE sub_orders SET state = 'dispatched' WHERE id = $1`, [id]),
    );
    expect(msg).toMatch(/Illegal sub-order transition/);
  });

  it('permits the whole happy path', async () => {
    const id = await newSubOrder();
    for (const s of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      await db.query(`UPDATE sub_orders SET state = $2 WHERE id = $1`, [id, s]);
    }
    const r = await db.query<{ state: string }>(`SELECT state FROM sub_orders WHERE id = $1`, [id]);
    expect(r.rows[0]!.state).toBe('delivered');
  });
});

describe('acceptance gate 5 — only a delivered sub-order can produce a review', () => {
  const build = async (finalState: string) => {
    const o = await db.query<{ id: string }>(
      `INSERT INTO orders (reference, customer_id, contact_phone, contact_name,
         governorate, city, area, street, building, source,
         merchandise_piastres, shipping_piastres, total_piastres, payment_method)
       VALUES ('DY-' || substr(gen_random_uuid()::text,1,8), $1, '01009998877', 'أحمد',
         'cairo', 'x', 'y', 'z', '1', 'organic_search', 38000, 4500, 42500, 'cod') RETURNING id`,
      [customerId],
    );
    const s = await db.query<{ id: string }>(
      // The delivery details are NOT NULL since 0004: a house cannot read the
      // parent order, so what it needs to ship lives on its own row. The
      // fixture predated that migration and had never been told.
      `INSERT INTO sub_orders (order_id, seller_id, reference, merchandise_piastres, shipping_piastres,
         delivery_fulfilled_by, recipient_name, recipient_phone,
         governorate, city, area, street, building)
       VALUES ($1, $2, 'DY-' || substr(gen_random_uuid()::text,1,8) || '-A', 38000, 4500,
         'seller', 'أحمد', '01009998877', 'cairo', 'مدينة نصر', 'السابع', 'عباس', '14') RETURNING id`,
      [o.rows[0]!.id, sellerId],
    );
    const p = await db.query<{ id: string }>(
      `INSERT INTO products (seller_id, brand_id, name, slug, sku, price_piastres, volume_ml)
       VALUES ($1, $2, 'ورد', 'w-' || gen_random_uuid(), 'S-' || substr(gen_random_uuid()::text,1,8), 38000, 30)
       RETURNING id`,
      [sellerId, brandId],
    );
    const li = await db.query<{ id: string }>(
      `INSERT INTO order_line_items (sub_order_id, product_id, product_name, brand_name, sku, volume_ml,
         quantity, unit_price_piastres, line_piastres,
         commission_source, commission_bps, commission_rule_set_version, commission_piastres)
       VALUES ($1, $2, 'ورد الطائف', 'دار الورد', 'S1', 30, 1, 38000, 38000,
         'storefront_referral', 500, 1, 1900) RETURNING id`,
      [s.rows[0]!.id, p.rows[0]!.id],
    );
    for (const st of ['awaiting_seller', 'confirmed', 'dispatched', 'delivered']) {
      if (st === finalState) {
        await db.query(`UPDATE sub_orders SET state = $2 WHERE id = $1`, [s.rows[0]!.id, st]);
        break;
      }
      await db.query(`UPDATE sub_orders SET state = $2 WHERE id = $1`, [s.rows[0]!.id, st]);
    }
    return { subOrderId: s.rows[0]!.id, lineItemId: li.rows[0]!.id, productId: p.rows[0]!.id };
  };

  const review = (ctx: { subOrderId: string; lineItemId: string; productId: string }) =>
    db.query(
      `INSERT INTO reviews (sub_order_id, line_item_id, product_id, customer_id,
         rating_scent, rating_longevity, rating_projection, rating_value,
         rating_packaging, rating_description_accuracy, author_label)
       VALUES ($1, $2, $3, $4, 5, 4, 4, 5, 5, 4,'أحمد ع.')`,
      [ctx.subOrderId, ctx.lineItemId, ctx.productId, customerId],
    );

  it('refuses a review on a sub-order still in transit', async () => {
    const ctx = await build('dispatched');
    const msg = await refuses(() => review(ctx));
    expect(msg).toMatch(/Acceptance gate 5/);
    expect(msg).toMatch(/dispatched/);
  });

  it('accepts a review once delivered', async () => {
    const ctx = await build('delivered');
    await review(ctx);
    const r = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM reviews WHERE sub_order_id = $1`,
      [ctx.subOrderId],
    );
    expect(r.rows[0]!.count).toBe(1);
  });

  it('refuses a second review on the same line item', async () => {
    const ctx = await build('delivered');
    await review(ctx);
    const msg = await refuses(() => review(ctx));
    expect(msg).toMatch(/reviews_line_item_key/);
  });

  it('refuses a rating outside 1–5', async () => {
    const ctx = await build('delivered');
    const msg = await refuses(() =>
      db.query(
        `INSERT INTO reviews (sub_order_id, line_item_id, product_id, customer_id,
           rating_scent, rating_longevity, rating_projection, rating_value,
           rating_packaging, rating_description_accuracy, author_label)
         VALUES ($1, $2, $3, $4, 9, 4, 4, 5, 5, 4,'أحمد ع.')`,
        [ctx.subOrderId, ctx.lineItemId, ctx.productId, customerId],
      ),
    );
    expect(msg).toMatch(/reviews_ratings_in_range/);
  });
});

describe('acceptance gate 6 — the audit trail cannot be rewritten', () => {
  it('accepts an entry', async () => {
    await db.query(
      `INSERT INTO audit_log (action, actor_label, entity_table, entity_id, note)
       VALUES ('seller_status_change', 'منى — عمليات', 'sellers', $1, 'approved')`,
      [sellerId],
    );
    const r = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM audit_log`);
    expect(r.rows[0]!.count).toBeGreaterThan(0);
  });

  it('refuses to update one', async () => {
    const msg = await refuses(() => db.query(`UPDATE audit_log SET note = 'rewritten'`));
    expect(msg).toMatch(/append-only/);
  });

  it('refuses to delete one', async () => {
    const msg = await refuses(() => db.query(`DELETE FROM audit_log`));
    expect(msg).toMatch(/append-only/);
  });

  it('protects the transition and revision ledgers the same way', async () => {
    expect(await refuses(() => db.query(`DELETE FROM sub_order_transitions`))).toMatch(/append-only/);
    expect(await refuses(() => db.query(`DELETE FROM product_revisions`))).toMatch(/append-only/);
    expect(await refuses(() => db.query(`DELETE FROM consent_records`))).toMatch(/append-only/);
  });
});

describe('commission rules — economics need two approvers', () => {
  it('refuses a rule set approved by one founder alone', async () => {
    const msg = await refuses(() =>
      db.query(
        `INSERT INTO commission_rule_sets (version, effective_from, approved_by,
           storefront_referral_bps, direct_repeat_bps, organic_search_bps, paid_campaign_bps,
           creator_affiliate_bps, email_crm_bps, unknown_bps)
         VALUES (99, now(), ARRAY['ahmed'], 500, 500, 1500, 1800, 1500, 1200, 500)`,
      ),
    );
    expect(msg).toMatch(/rule_set_two_approvers/);
  });

  it('accepts one approved by both', async () => {
    await db.query(
      `INSERT INTO commission_rule_sets (version, effective_from, approved_by,
         storefront_referral_bps, direct_repeat_bps, organic_search_bps, paid_campaign_bps,
         creator_affiliate_bps, email_crm_bps, unknown_bps)
       VALUES (1, now(), ARRAY['ahmed','partner'], 500, 500, 1500, 1800, 1500, 1200, 500)`,
    );
    const r = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM commission_rule_sets`);
    expect(r.rows[0]!.count).toBe(1);
  });

  it('refuses a rate above 100%', async () => {
    const msg = await refuses(() =>
      db.query(
        `INSERT INTO commission_rule_sets (version, effective_from, approved_by,
           storefront_referral_bps, direct_repeat_bps, organic_search_bps, paid_campaign_bps,
           creator_affiliate_bps, email_crm_bps, unknown_bps)
         VALUES (2, now(), ARRAY['a','b'], 500, 500, 1500, 99999, 1500, 1200, 500)`,
      ),
    );
    expect(msg).toMatch(/rule_set_bps_sane/);
  });
});

describe('webhooks — duplicate delivery cannot double-process a money event', () => {
  it('refuses the same provider event twice', async () => {
    await db.query(
      `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload)
       VALUES ('paymob', 'evt_1001', 'transaction.paid', '{}')`,
    );
    const msg = await refuses(() =>
      db.query(
        `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload)
         VALUES ('paymob', 'evt_1001', 'transaction.paid', '{}')`,
      ),
    );
    expect(msg).toMatch(/webhook_events_provider_key/);
  });
});
