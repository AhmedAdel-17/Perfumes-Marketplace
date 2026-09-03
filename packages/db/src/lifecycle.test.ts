/**
 * End-to-end money flow, through a real Postgres.
 *
 * Everything so far has been proved in halves: the domain reasons about money
 * with no database, the database enforces gates with no domain. This is the
 * seam, and seams are where marketplaces actually break.
 *
 * One multi-seller order is carried from checkout to payout:
 *
 *   PlaceOrder (domain)  ->  persisted rows (db)  ->  state machine (both)
 *     ->  delivery  ->  SettlementService (domain)  ->  a statement that
 *         reconciles against what the database actually holds
 *
 * The test asserts that the numbers the domain computes and the numbers the
 * database stores are the same numbers — which is the only way to know the two
 * enforcement points have not drifted.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Address, FixedClock, Money, PlaceOrder, SettlementService, SubOrderLifecycle,
  sumMoney, type PlaceOrderInput, type SettlementSubOrder,
} from '@diyar/domain';

let db: PGlite;
const MIGRATIONS = join(import.meta.dirname, '../migrations');
const runSql = async (f: string) =>
  db.exec(readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--> statement-breakpoint/g, ''));

const ORDERED_AT = new Date('2026-09-01T18:00:00Z');
const egp = (v: string) => Money.fromMajorString(v);

const WARD = 'dar-al-ward';
const NOUR = 'maison-nour';

const ids: Record<string, string> = {};

beforeAll(async () => {
  db = new PGlite();
  await runSql('0000_initial.sql');
  await runSql('0001_constraints.sql');
  await runSql('0002_rls.sql');
  await runSql('0003_checkout.sql');
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='99999999-9999-9999-9999-999999999999';`);

  const one = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;

  for (const [key, name, slug] of [[WARD, 'دار الورد', 'dar-al-ward'], [NOUR, 'ميزون نور', 'maison-nour']] as const) {
    const s = await one<{ id: string }>(
      `INSERT INTO sellers (trading_name, owner_name, contact_phone, slug, status, payout_reserve_days)
       VALUES ($1,'مالك','01001234567',$2,'applied',7) RETURNING id`, [name, slug]);
    ids[key] = s.id;
    await db.query(`UPDATE seller_verifications SET status='approved' WHERE seller_id=$1`, [s.id]);
    await db.query(`UPDATE sellers SET status='live' WHERE id=$1`, [s.id]);

    const b = await one<{ id: string }>(
      `INSERT INTO brands (seller_id,name,slug) VALUES ($1,$2,$3) RETURNING id`,
      [s.id, name, slug + '-b']);
    ids[key + ':brand'] = b.id;
  }

  ids.customer = (await one<{ id: string }>(
    `INSERT INTO customers (phone, full_name) VALUES ('01009998877','أحمد') RETURNING id`)).id;

  for (const [key, price] of [[WARD, 38000], [NOUR, 45000]] as const) {
    const p = await one<{ id: string }>(
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml)
       VALUES ($1,$2,'عطر','p-'||gen_random_uuid(),'SKU-'||substr(gen_random_uuid()::text,1,8),$3,50)
       RETURNING id`, [ids[key], ids[key + ':brand'], price]);
    ids[key + ':product'] = p.id;
  }
}, 180_000);

afterAll(async () => { await db?.close(); });

/** The domain's view of the checkout, computed once and reused. */
const draftInput = (): PlaceOrderInput => ({
    reference: 'DY-77001',
    customerId: ids.customer!,
    contactPhone: '01009998877',
    contactName: 'أحمد',
    address: Address.create({
      governorate: 'cairo', city: 'مدينة نصر', area: 'الحي السابع',
      street: 'شارع عباس العقاد', building: '14', floor: '3', apartment: '7',
      landmark: 'أمام مسجد الرحمن',
    }),
    lines: [
      {
        productId: ids[WARD + ':product']!, sellerId: WARD, productName: 'ورد الطائف',
        brandName: 'دار الورد', sku: 'WRD-30', volumeMl: 30, quantity: 1, unitPrice: egp('380'),
      },
      {
        productId: ids[NOUR + ':product']!, sellerId: NOUR, productName: 'ليل القاهرة',
        brandName: 'ميزون نور', sku: 'NUR-50', volumeMl: 50, quantity: 2, unitPrice: egp('450'),
      },
    ],
    shipping: [
      { sellerId: WARD, amount: egp('50'), etaDaysMin: 3, etaDaysMax: 4 },
      { sellerId: NOUR, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 },
    ],
    terms: [
      { sellerId: WARD, confirmationSlaHours: 24, dispatchSlaHours: 48 },
      { sellerId: NOUR, confirmationSlaHours: 24, dispatchSlaHours: 48 },
    ],
    paymentMethod: 'cod',
    touches: [
      { channel: 'storefront_referral', at: new Date('2026-08-30T10:00:00Z'), ref: 'dar-al-ward', sellerId: WARD },
      // A real session browsing the marketplace records this. Without it every
      // order falls through to `unknown`, which carries the LOW rate — see the
      // "attribution pipeline" test below.
      { channel: 'organic_search', at: new Date('2026-09-01T17:50:00Z') },
    ],
    priorPurchaseSellerIds: new Set<string>(),
    orderedAt: ORDERED_AT,
  });

const draft = () => new PlaceOrder(new FixedClock(ORDERED_AT)).build(draftInput());

describe('checkout — the domain draft persists without contradiction', () => {
  it('writes an order the database accepts', async () => {
    const d = draft();
    const o = await db.query<{ id: string }>(
      `INSERT INTO orders (reference,customer_id,contact_phone,contact_name,
         governorate,city,area,street,building,source,
         merchandise_piastres,shipping_piastres,total_piastres,payment_method,placed_at)
       VALUES ($1,$2,$3,$4,'cairo','مدينة نصر','السابع','عباس العقاد','14',$5,$6,$7,$8,'cod',$9)
       RETURNING id`,
      [d.reference, d.customerId, d.contactPhone, d.contactName, d.source,
       d.merchandise.minor, d.shipping.minor, d.total.minor, d.placedAt]);
    ids.order = o.rows[0]!.id;

    for (const s of d.subOrders) {
      const sub = await db.query<{ id: string }>(
        `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,
           shipping_piastres,confirm_due_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ids.order, ids[s.sellerId], s.reference, s.merchandise.minor, s.shipping.minor, s.confirmDueAt]);
      ids[s.sellerId + ':sub'] = sub.rows[0]!.id;

      for (const li of s.lineItems) {
        await db.query(
          `INSERT INTO order_line_items (sub_order_id,product_id,product_name,brand_name,sku,volume_ml,
             quantity,unit_price_piastres,line_piastres,
             commission_source,commission_bps,commission_rule_set_version,commission_piastres)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [ids[s.sellerId + ':sub'], ids[s.sellerId + ':product'], li.productName, li.brandName,
           li.sku, li.volumeMl, li.quantity, li.unitPrice.minor, li.line.minor,
           li.commission.source, li.commission.bps, li.commission.ruleSetVersion,
           li.commissionAmount.minor]);
      }
    }
    expect(ids.order).toBeTruthy();
  });

  it('stores exactly the totals the domain computed', async () => {
    const d = draft();
    const r = await db.query<{ m: number; s: number; t: number }>(
      `SELECT merchandise_piastres m, shipping_piastres s, total_piastres t FROM orders WHERE id=$1`,
      [ids.order]);
    expect(r.rows[0]).toEqual({ m: d.merchandise.minor, s: d.shipping.minor, t: d.total.minor });
    expect(d.total.toMajorString()).toBe('1375.00');   // 380 + 900 + 50 + 45
  });

  it('charges each house from its OWN attribution, not the order-level source', async () => {
    const r = await db.query<{ seller: string; source: string; bps: number; fee: number }>(
      `SELECT s.slug seller, li.commission_source source, li.commission_bps bps,
              li.commission_piastres fee
       FROM order_line_items li
       JOIN sub_orders so ON so.id = li.sub_order_id
       JOIN sellers s ON s.id = so.seller_id
       ORDER BY s.slug`);

    const ward = r.rows.find((x) => x.seller === 'dar-al-ward')!;
    const nour = r.rows.find((x) => x.seller === 'maison-nour')!;

    // Ward owns the referral link -> 5% on 380 = 19
    expect(ward.source).toBe('storefront_referral');
    expect(ward.bps).toBe(500);
    expect(ward.fee).toBe(1900);

    // Nour did not bring this customer -> marketplace rate on 900
    // Nour did not bring this customer -> marketplace rate on 900
    expect(nour.source).toBe('organic_search');
    expect(nour.bps).toBe(1500);
    expect(nour.fee).toBe(13500);
  });

  it('an order with NO recorded touches falls to `unknown`, which is the LOW rate', () => {
    // Operationally important: `unknown` resolves in the seller's favour at 5%.
    // That is the right default for fairness, but it means a broken attribution
    // pipeline silently undercharges every marketplace order rather than
    // failing loudly. Touch capture is a revenue path, not just analytics.
    const bare = new PlaceOrder(new FixedClock(ORDERED_AT)).build({
      ...draftInput(), touches: [],
    });
    expect(bare.subOrders.every((s) => s.attribution.source === 'unknown')).toBe(true);
    expect(bare.subOrders.every((s) => s.lineItems[0]!.commission.bps === 500)).toBe(true);
  });

  it('gives each sub-order its own SLA clock', async () => {
    const r = await db.query<{ due: Date }>(`SELECT confirm_due_at due FROM sub_orders`);
    for (const row of r.rows) {
      expect(new Date(row.due).toISOString()).toBe('2026-09-02T18:00:00.000Z');
    }
  });
});

describe('fulfilment — the state machine holds on both sides', () => {
  it('refuses an illegal jump in the database, exactly as the domain does', async () => {
    const id = ids[WARD + ':sub']!;
    await db.query(`UPDATE sub_orders SET state='awaiting_seller' WHERE id=$1`, [id]);

    expect(() => SubOrderLifecycle.transition('awaiting_seller', { to: 'dispatched', actor: 'seller' },
      new FixedClock(ORDERED_AT))).toThrow();

    let refused = '';
    try {
      await db.query(`UPDATE sub_orders SET state='dispatched' WHERE id=$1`, [id]);
    } catch (e) { refused = (e as Error).message; }
    expect(refused).toMatch(/Illegal sub-order transition/);
  });

  it('carries both sub-orders to delivered', async () => {
    for (const key of [WARD, NOUR]) {
      const id = ids[key + ':sub']!;
      const current = (await db.query<{ state: string }>(
        `SELECT state FROM sub_orders WHERE id=$1`, [id])).rows[0]!.state;
      const path = ['awaiting_seller', 'confirmed', 'dispatched', 'delivered'];
      for (const st of path.slice(path.indexOf(current) + 1)) {
        await db.query(
          `UPDATE sub_orders
              SET state = $2::sub_order_state,
                  delivered_at = CASE WHEN $2::text = 'delivered'
                                      THEN TIMESTAMPTZ '2026-09-05 12:00:00+00'
                                      ELSE delivered_at END
            WHERE id = $1`, [id, st]);
      }
    }
    const r = await db.query<{ state: string }>(`SELECT state FROM sub_orders`);
    expect(r.rows.every((x) => x.state === 'delivered')).toBe(true);
  });

  it('now permits a review, which it refused before delivery', async () => {
    const li = (await db.query<{ id: string; p: string }>(
      `SELECT li.id, li.product_id p FROM order_line_items li
       WHERE li.sub_order_id=$1`, [ids[WARD + ':sub']])).rows[0]!;
    await db.query(
      `INSERT INTO reviews (sub_order_id,line_item_id,product_id,customer_id,
         rating_scent,rating_longevity,rating_projection,rating_value,
         rating_packaging,rating_description_accuracy)
       VALUES ($1,$2,$3,$4,5,4,4,5,5,5)`,
      [ids[WARD + ':sub'], li.id, li.p, ids.customer]);
    const n = await db.query<{ c: number }>(`SELECT count(*)::int c FROM reviews`);
    expect(n.rows[0]!.c).toBe(1);
  });
});

describe('settlement — the statement reconciles against what the database holds', () => {
  const loadForSettlement = async (): Promise<SettlementSubOrder[]> => {
    const rows = (await db.query<{
      id: string; reference: string; state: string;
      merchandise: number; shipping: number; source: string; bps: number; delivered: Date | null;
    }>(`SELECT so.id, so.reference, so.state,
               so.merchandise_piastres merchandise, so.shipping_piastres shipping,
               li.commission_source source, li.commission_bps bps, so.delivered_at delivered
        FROM sub_orders so
        JOIN LATERAL (SELECT commission_source, commission_bps FROM order_line_items
                      WHERE sub_order_id = so.id LIMIT 1) li ON true
        WHERE so.seller_id = $1`, [ids[WARD]])).rows;

    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      state: r.state as SettlementSubOrder['state'],
      merchandise: Money.fromMinor(r.merchandise),
      shipping: Money.fromMinor(r.shipping),
      commissionSource: r.source as SettlementSubOrder['commissionSource'],
      commissionBps: r.bps,
      ...(r.delivered ? { deliveredAt: new Date(r.delivered) } : {}),
      cashInHand: true,
    }));
  };

  it('holds the money while the reserve period is still running', async () => {
    const st = new SettlementService(new FixedClock(new Date('2026-09-08T00:00:00Z'))).build({
      sellerId: WARD,
      periodStart: new Date('2026-09-01T00:00:00Z'),
      periodEnd: new Date('2026-09-07T00:00:00Z'),   // delivered 5 Sep, reserve 7 days
      subOrders: await loadForSettlement(),
      adjustments: [],
      reserveDays: 7,
      disputeWindowDays: 7,
    });
    expect(st.lines[0]!.outcome).toBe('held');
    expect(st.net.isZero()).toBe(true);
  });

  it('pays out once the reserve clears, and the arithmetic matches the database', async () => {
    const subs = await loadForSettlement();
    const st = new SettlementService(new FixedClock(new Date('2026-09-20T00:00:00Z'))).build({
      sellerId: WARD,
      periodStart: new Date('2026-09-01T00:00:00Z'),
      periodEnd: new Date('2026-09-19T00:00:00Z'),
      subOrders: subs,
      adjustments: [],
      reserveDays: 7,
      disputeWindowDays: 7,
    });

    expect(st.lines[0]!.outcome).toBe('earned');
    expect(st.gross.toMajorString()).toBe('380.00');
    expect(st.commission.toMajorString()).toBe('19.00');     // 5%, the storefront rate
    expect(st.shipping.toMajorString()).toBe('50.00');
    expect(st.net.toMajorString()).toBe('311.00');
    expect(SettlementService.reconciles(st)).toBe(true);

    // The fee the domain just computed equals the fee stored at purchase time.
    const stored = await db.query<{ fee: number }>(
      `SELECT li.commission_piastres fee FROM order_line_items li
       JOIN sub_orders so ON so.id = li.sub_order_id WHERE so.seller_id=$1`, [ids[WARD]]);
    expect(sumMoney(st.lines.map((l) => l.commission)).minor).toBe(stored.rows[0]!.fee);
  });

  it('persists the payout, and the database refuses a line that does not balance', async () => {
    const subs = await loadForSettlement();
    const st = new SettlementService(new FixedClock(new Date('2026-09-20T00:00:00Z'))).build({
      sellerId: WARD, periodStart: new Date('2026-09-01T00:00:00Z'),
      periodEnd: new Date('2026-09-19T00:00:00Z'), subOrders: subs,
      adjustments: [], reserveDays: 7, disputeWindowDays: 7,
    });

    const payout = await db.query<{ id: string }>(
      `INSERT INTO payouts (seller_id,reference,period_start,period_end,
         gross_piastres,commission_piastres,shipping_piastres,net_piastres,dispute_deadline)
       VALUES ($1,'PO-77001',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [ids[WARD], st.periodStart, st.periodEnd, st.gross.minor, st.commission.minor,
       st.shipping.minor, st.net.minor, st.disputeDeadline]);

    const line = st.lines[0]!;
    await db.query(
      `INSERT INTO payout_lines (payout_id,sub_order_id,gross_piastres,commission_piastres,
         commission_source,commission_bps,shipping_piastres,net_piastres)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [payout.rows[0]!.id, line.subOrderId, line.gross.minor, line.commission.minor,
       line.commissionSource, line.commissionBps, line.shipping.minor,
       line.gross.minus(line.commission).minor]);

    // A deliberately unbalanced line must be refused by the CHECK constraint.
    let refused = '';
    try {
      await db.query(
        `INSERT INTO payout_lines (payout_id,sub_order_id,gross_piastres,commission_piastres,
           commission_source,commission_bps,shipping_piastres,net_piastres)
         VALUES ($1,$2,100000,5000,'organic_search',1500,0,999999)`,
        [payout.rows[0]!.id, ids[NOUR + ':sub']]);
    } catch (e) { refused = (e as Error).message; }
    expect(refused).toMatch(/payout_lines_net_reconciles/);
  });
});

describe('the audit trail survives the whole flow', () => {
  it('records money-affecting actions and cannot be rewritten afterwards', async () => {
    await db.query(
      `INSERT INTO audit_log (action, actor_label, entity_table, entity_id, note)
       VALUES ('payout_approval','أحمد — مؤسّس','payouts',NULL,'PO-77001 approved')`);

    let refused = '';
    try { await db.query(`UPDATE audit_log SET note='changed'`); }
    catch (e) { refused = (e as Error).message; }
    expect(refused).toMatch(/append-only/);
  });
});
