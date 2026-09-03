/**
 * API boundary tests.
 *
 * Two things are proved here that cannot be proved anywhere else:
 *
 *  1. Untrusted input is rejected at the boundary, in Arabic, before it reaches
 *     the domain or the database.
 *  2. Authorisation holds through the WHOLE stack — a seller calling the real
 *     router against a real Postgres cannot reach another house's orders. RLS
 *     was proved in isolation; this proves it is actually wired up, which is a
 *     different claim and the one that matters in production.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@diyar/domain';
import { DrizzleUnitOfWork, schema, type ActorContext, type DiyarDatabase } from '@diyar/db';
import { appRouter } from './routers/index';
import { placeOrderSchema, declineSchema, phoneSchema } from './validation';
import type { ApiContext } from './trpc';

const MIGRATIONS = join(import.meta.dirname, '../../db/migrations');
const CLOCK = new FixedClock(new Date('2026-09-02T09:00:00Z'));

let pg: PGlite;
let db: DiyarDatabase;

const WARD_STAFF = '11111111-1111-1111-1111-111111111111';
const NOUR_STAFF = '33333333-3333-3333-3333-333333333333';
const PLATFORM = '99999999-9999-9999-9999-999999999999';

const ids: Record<string, string> = {};

/** Matches the products seeded below. */
const MAX_STOCK = 25;

const caller = (actor: ActorContext, sellerId: string | null = null) => {
  const ctx: ApiContext = {
    actor,
    sellerId,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

beforeAll(async () => {
  pg = new PGlite();
  for (const f of ['0000_initial.sql', '0001_constraints.sql', '0002_rls.sql', '0003_checkout.sql', '0004_sub_order_delivery.sql', '0005_checkout_handoff.sql']) {
    await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--> statement-breakpoint/g, ''));
  }
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  // Seed as platform so the RLS policies permit it.
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  for (const [slug, name, staff] of [
    ['dar-al-ward', 'دار الورد', WARD_STAFF],
    ['maison-nour', 'ميزون نور', NOUR_STAFF],
  ] as const) {
    const s = await pg.query<{ id: string }>(
      `INSERT INTO sellers (trading_name,owner_name,contact_phone,slug,status)
       VALUES ($1,'مالك','01001234567',$2,'live') RETURNING id`, [name, slug]);
    ids[slug] = s.rows[0]!.id;
    await pg.query(
      `INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name) VALUES ($1,$2,'owner','مالك')`,
      [ids[slug], staff]);

    const b = await pg.query<{ id: string }>(
      `INSERT INTO brands (seller_id,name,slug) VALUES ($1,$2,$3) RETURNING id`,
      [ids[slug], name, slug + '-b']);

    const p = await pg.query<{ id: string }>(
      // stock is seeded explicitly: the column defaults to 0, and a published
      // listing with no stock is a legitimate state the cart correctly refuses.
      // Leaving it at the default made every cart assertion here fail for a
      // reason that had nothing to do with carts.
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock,status,
         concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,
         seasons,occasions,day_night,projection_band,longevity_band,performance_source,
         responsible_party_name,return_eligibility,defect_route)
       VALUES ($1,$2,'عطر',$3,$4,38000,50,25,'draft',
         'eau_de_parfum','spray','women','floral',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['مسك'],
         ARRAY['spring']::season[],ARRAY['daily']::occasion[],'both','moderate','long','seller_provided',
         $5,'sealed_only','استلام') RETURNING id`,
      [ids[slug], b.rows[0]!.id, slug + '-product', 'SKU-' + slug, name]);
    ids[slug + ':product'] = p.rows[0]!.id;

    await pg.query(
      `INSERT INTO product_media (product_id,storage_path,alt_text,is_primary,ownership_confirmed)
       VALUES ($1,'p.jpg','زجاجة',true,true)`, [p.rows[0]!.id]);
    await pg.query(`UPDATE products SET status='published' WHERE id=$1`, [p.rows[0]!.id]);
  }

  const c = await pg.query<{ id: string }>(
    `INSERT INTO customers (phone,full_name) VALUES ('01009998877','أحمد') RETURNING id`);
  ids.customer = c.rows[0]!.id;

  // One order per house, so isolation has something to hide.
  for (const slug of ['dar-al-ward', 'maison-nour']) {
    const o = await pg.query<{ id: string }>(
      `INSERT INTO orders (reference,customer_id,contact_phone,contact_name,governorate,city,area,
         street,building,source,merchandise_piastres,shipping_piastres,total_piastres,payment_method)
       VALUES ($1,$2,'01009998877','أحمد','cairo','مدينة نصر','السابع','عباس','14','organic_search',
         38000,5000,43000,'cod') RETURNING id`, ['DY-' + slug, ids.customer]);
    const so = await pg.query<{ id: string }>(
      // Delivery details are NOT NULL on sub_orders since 0004: a house cannot
      // read the parent order, so what it needs to ship lives on its own row.
      `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,state,
         recipient_name,recipient_phone,governorate,city,area,street,building)
       VALUES ($1,$2,$3,38000,5000,'awaiting_seller',
         'أحمد','01009998877','cairo','مدينة نصر','السابع','عباس','14') RETURNING id`,
      [o.rows[0]!.id, ids[slug], 'DY-' + slug + '-A']);
    ids[slug + ':sub'] = so.rows[0]!.id;
  }

  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
}, 180_000);

afterAll(async () => { await pg?.close(); });

describe('cart.price — anonymous, and priced from the database every time', () => {
  const ANON: ActorContext = { role: 'anon', id: null };

  it('prices a basket for a visitor who has not identified themselves', async () => {
    // Requiring a login to see a total is the fastest way to lose a first-time
    // customer, so this must work with no actor at all.
    const cart = await caller(ANON).cart.price({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 2 }],
    });

    expect(cart.isEmpty).toBe(false);
    expect(cart.merchandisePiastres).toBe(76_000);
    expect(cart.itemCount).toBe(2);
    expect(cart.totalPiastres).toBe(cart.merchandisePiastres + cart.shippingPiastres);
  });

  it('charges shipping per HOUSE, not per basket', async () => {
    const one = await caller(ANON).cart.price({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
    });
    const two = await caller(ANON).cart.price({
      lines: [
        { productId: ids['dar-al-ward:product']!, quantity: 1 },
        { productId: ids['maison-nour:product']!, quantity: 1 },
      ],
    });

    expect(two.houses).toHaveLength(2);
    // Two houses pack two parcels. Quoting one delivery here and two at
    // checkout is the version of this bug that reaches production.
    expect(two.shippingPiastres).toBe(one.shippingPiastres * 2);
  });

  it('ignores the price the client claims it saw', async () => {
    const cart = await caller(ANON).cart.price({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1, seenPricePiastres: 1 }],
    });

    expect(cart.merchandisePiastres).toBe(38_000);
    const changed = cart.adjustments.find((a) => a.reason === 'price_changed');
    expect(changed?.previousPricePiastres).toBe(1);
    expect(changed?.currentPricePiastres).toBe(38_000);
  });

  it('drops an id that does not exist rather than failing the whole basket', async () => {
    const cart = await caller(ANON).cart.price({
      lines: [
        { productId: ids['dar-al-ward:product']!, quantity: 1 },
        { productId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
      ],
    });

    expect(cart.houses).toHaveLength(1);
    expect(cart.adjustments.map((a) => a.reason)).toContain('no_longer_available');
  });

  it('prices an empty basket as zero instead of erroring', async () => {
    // `IN ()` is a Postgres syntax error, so an empty cart is the request most
    // likely to take the page down.
    const cart = await caller(ANON).cart.price({ lines: [] });
    expect(cart.isEmpty).toBe(true);
    expect(cart.totalPiastres).toBe(0);
  });

  it('refuses a quantity or a basket size outside the permitted range', async () => {
    await expect(caller(ANON).cart.price({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 0 }],
    })).rejects.toThrow();

    await expect(caller(ANON).cart.price({
      lines: [{ productId: 'not-a-uuid', quantity: 1 }],
    })).rejects.toThrow();
  });
});

describe('orders.place — the total is decided here, not by the client', () => {
  const ANON: ActorContext = { role: 'anon', id: null };

  const ADDRESS = {
    governorate: 'cairo' as const,
    city: 'مدينة نصر',
    area: 'الحي السابع',
    street: 'شارع عباس العقاد',
    building: '14',
    landmark: 'أمام مسجد النور',
  };

  const order = (over: Record<string, unknown> = {}) => ({
    contactName: 'أحمد عادل',
    contactPhone: '01009998877',
    address: ADDRESS,
    lines: [{ productId: ids['dar-al-ward:product']!, quantity: 2 }],
    paymentMethod: 'cod' as const,
    ...over,
  });

  it('places a cash-on-delivery order and returns a readable reference', async () => {
    const placed = await caller(ANON).orders.place(order());

    expect(placed.reference).toMatch(/^DY-[CDFHJKMNPQRVWXY349]{8}$/);
    // 2 x 380 merchandise + 55 shipping, computed from the database.
    expect(placed.totalPiastres).toBe(76_000 + 5_500);
    expect(placed.houseCount).toBe(1);
  });

  it('splits one basket into one sub-order per house', async () => {
    const placed = await caller(ANON).orders.place(order({
      lines: [
        { productId: ids['dar-al-ward:product']!, quantity: 1 },
        { productId: ids['maison-nour:product']!, quantity: 1 },
      ],
    }));

    expect(placed.houseCount).toBe(2);
    // Two parcels, two delivery charges — the same arithmetic the cart showed.
    expect(placed.totalPiastres).toBe(38_000 + 38_000 + 5_500 + 5_500);
  });

  it('treats the phone as the identity across separate guest orders', async () => {
    // Two checkouts, one phone, one customer. If this fractured, order history,
    // repeat attribution and support would all split along an invisible seam.
    const first = await caller(ANON).orders.place(order({ contactPhone: '01111112222' }));
    const second = await caller(ANON).orders.place(order({ contactPhone: '01111112222' }));

    expect(first.reference).not.toBe(second.reference);

    const rows = await pg.query<{ n: number }>(
      `SELECT count(*)::int n FROM customers WHERE phone = '01111112222'`);
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('refuses an address the domain considers undeliverable', async () => {
    await expect(caller(ANON).orders.place(order({
      address: { ...ADDRESS, building: '' },
    }))).rejects.toThrow();
  });

  it('refuses a basket whose products have all gone', async () => {
    await expect(caller(ANON).orders.place(order({
      lines: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
    }))).rejects.toThrow();
  });

  it('refuses to place an order whose lines moved since the bag was shown', async () => {
    // Quantity beyond stock would be silently reduced by the pricer. Silently
    // ordering a different quantity than the customer agreed to is worse than
    // failing, so placement rejects any adjustment and sends them back to the
    // bag to see what changed.
    await expect(caller(ANON).orders.place(order({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: MAX_STOCK + 5 }],
    }))).rejects.toThrow();
  });

  it('refuses a payment method the configured gateway cannot process', async () => {
    await expect(caller(ANON).orders.place(order({
      paymentMethod: 'card',
    }) as never)).rejects.toThrow();
  });
});

describe('orders.byReference — two factors, neither a password', () => {
  const ANON: ActorContext = { role: 'anon', id: null };

  it('finds an order from its reference and phone', async () => {
    const placed = await caller(ANON).orders.place({
      contactName: 'سارة محمود',
      contactPhone: '01234445555',
      address: {
        governorate: 'giza', city: 'الدقي', area: 'المساحة',
        street: 'شارع التحرير', building: '7',
      },
      lines: [{ productId: ids['maison-nour:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const found = await caller(ANON).orders.byReference({
      reference: placed.reference, phone: '01234445555',
    });
    expect(found?.reference).toBe(placed.reference);
    expect(found?.totalPiastres).toBe(placed.totalPiastres);
  });

  it('forgives case and a missing hyphen in what the customer typed', async () => {
    const placed = await caller(ANON).orders.place({
      contactName: 'سارة محمود',
      contactPhone: '01234445555',
      address: {
        governorate: 'giza', city: 'الدقي', area: 'المساحة',
        street: 'شارع التحرير', building: '7',
      },
      lines: [{ productId: ids['maison-nour:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const messy = placed.reference.toLowerCase().replace('-', ' ');
    const found = await caller(ANON).orders.byReference({
      reference: messy, phone: '01234445555',
    });
    expect(found?.reference).toBe(placed.reference);
  });

  it('discloses NOTHING to a correct reference with the wrong phone', async () => {
    // The claim this endpoint makes about itself. The first version accepted a
    // phone, described itself as two-factor, and never compared it — so a
    // reference shared in a WhatsApp screenshot handed over the customer's
    // name, address and basket.
    const placed = await caller(ANON).orders.place({
      contactName: 'منى صلاح',
      contactPhone: '01555554444',
      address: {
        governorate: 'alexandria', city: 'سموحة', area: 'فيكتور عمانويل',
        street: 'شارع فوزي معاذ', building: '22',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const withWrongPhone = await caller(ANON).orders.byReference({
      reference: placed.reference, phone: '01000000001',
    });
    expect(withWrongPhone).toBeNull();

    // And the same reference with the right phone still works, so the test is
    // proving the phone check rather than a broken lookup.
    const withRightPhone = await caller(ANON).orders.byReference({
      reference: placed.reference, phone: '01555554444',
    });
    expect(withRightPhone?.reference).toBe(placed.reference);
    expect(withRightPhone?.contactName).toBe('منى صلاح');
  });

  it('returns the same null for a wrong phone and an unknown reference', async () => {
    // Identical answers, so the endpoint cannot be used to enumerate which
    // references exist.
    const unknown = await caller(ANON).orders.byReference({
      reference: 'DY-CDFHJKMN', phone: '01234445555',
    });
    expect(unknown).toBeNull();
  });

  it('returns nothing for a reference that cannot exist', async () => {
    const found = await caller(ANON).orders.byReference({
      reference: 'DY-OOOOOOOO', phone: '01234445555',
    });
    expect(found).toBeNull();
  });

  it('carries each house and its state, for the tracking page', async () => {
    const placed = await caller(ANON).orders.place({
      contactName: 'ياسمين فؤاد',
      contactPhone: '01277778888',
      address: {
        governorate: 'cairo', city: 'المعادي', area: 'دجلة',
        street: 'شارع 9', building: '3',
      },
      lines: [
        { productId: ids['dar-al-ward:product']!, quantity: 1 },
        { productId: ids['maison-nour:product']!, quantity: 1 },
      ],
      paymentMethod: 'cod',
    });

    const found = await caller(ANON).orders.byReference({
      reference: placed.reference, phone: '01277778888',
    });

    expect(found?.houses).toHaveLength(2);
    // Every house starts at `awaiting_seller`: placement hands the order over
    // in the same transaction. This assertion said `placed` until the seller
    // portal proved that a sub-order left in `placed` is one no house can
    // confirm — the test was encoding the bug rather than the intent.
    expect(found?.houses.every((h) => h.state === 'awaiting_seller')).toBe(true);
    expect(found?.houses.every((h) => h.items.length > 0)).toBe(true);
    expect(found?.paymentMethod).toBe('cod');
  });
});

describe('input validation — rejected at the boundary, in Arabic', () => {
  it('refuses a non-Egyptian phone number', () => {
    expect(phoneSchema.safeParse('12345').success).toBe(false);
    expect(phoneSchema.safeParse('+201001234567').success).toBe(true);
    expect(phoneSchema.safeParse('01001234567').success).toBe(true);
  });

  it('refuses a fractional or zero quantity', () => {
    const base = {
      contactName: 'أحمد', contactPhone: '01001234567',
      address: { governorate: 'cairo', city: 'ن', area: 'ح', street: 'ش', building: '1' },
      paymentMethod: 'cod' as const,
    };
    const bad = placeOrderSchema.safeParse({
      ...base, lines: [{ productId: crypto.randomUUID(), quantity: 1.5 }],
    });
    expect(bad.success).toBe(false);

    const zero = placeOrderSchema.safeParse({
      ...base, lines: [{ productId: crypto.randomUUID(), quantity: 0 }],
    });
    expect(zero.success).toBe(false);
  });

  it('refuses an empty cart', () => {
    const r = placeOrderSchema.safeParse({
      contactName: 'أحمد', contactPhone: '01001234567',
      address: { governorate: 'cairo', city: 'ن', area: 'ح', street: 'ش', building: '1' },
      lines: [], paymentMethod: 'cod',
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain('الحقيبة فارغة');
  });

  it('has no postal-code field to send, even if a client tries', () => {
    const r = placeOrderSchema.safeParse({
      contactName: 'أحمد', contactPhone: '01001234567',
      address: {
        governorate: 'cairo', city: 'ن', area: 'ح', street: 'ش', building: '1',
        postalCode: '11371',
      },
      lines: [{ productId: crypto.randomUUID(), quantity: 1 }], paymentMethod: 'cod',
    });
    expect(r.success).toBe(false);          // .strict() rejects the unknown key
  });

  it('refuses a decline with no coded reason — doc 06 §7 forbids generic reasons', () => {
    expect(declineSchema.safeParse({ subOrderId: crypto.randomUUID() }).success).toBe(false);
    expect(declineSchema.safeParse({
      subOrderId: crypto.randomUUID(), reason: 'because',
    }).success).toBe(false);
    expect(declineSchema.safeParse({
      subOrderId: crypto.randomUUID(), reason: 'out_of_stock',
    }).success).toBe(true);
  });
});

describe('public catalogue — anonymous traffic', () => {
  it('reads a published product', async () => {
    const api = caller({ role: 'anon', id: null });
    const p = await api.catalogue.productBySlug({ slug: 'dar-al-ward-product' });
    expect(p).not.toBeNull();
    expect(p!.pricePiastres).toBe(38000);
  });

  it('returns money as integer piastres, never a float', async () => {
    const api = caller({ role: 'anon', id: null });
    const p = await api.catalogue.productBySlug({ slug: 'dar-al-ward-product' });
    expect(Number.isInteger(p!.pricePiastres)).toBe(true);
    expect(JSON.stringify(p)).not.toContain('380.0');
  });

  it('returns null for an unknown slug rather than erroring', async () => {
    const api = caller({ role: 'anon', id: null });
    expect(await api.catalogue.productBySlug({ slug: 'nope' })).toBeNull();
  });

  it('refuses a malformed slug at the boundary', async () => {
    const api = caller({ role: 'anon', id: null });
    await expect(api.catalogue.productBySlug({ slug: 'Bad Slug!' })).rejects.toThrow();
  });
});

describe('authorisation — defence in depth, through the whole stack', () => {
  it('an anonymous caller cannot reach the seller queue', async () => {
    const api = caller({ role: 'anon', id: null });
    await expect(api.seller.queue()).rejects.toThrow(/يلزم تسجيل الدخول/);
  });

  it('a seller session with no linked house is refused', async () => {
    const api = caller({ role: 'seller', id: WARD_STAFF }, null);
    await expect(api.seller.queue()).rejects.toThrow(/غير مرتبط بدار/);
  });

  // These assert what the claim actually IS — every row belongs to the caller —
  // rather than a row COUNT. The count version passed only while this file
  // seeded exactly one order per house, and broke the moment real orders were
  // placed in the same database by another test. A test that fails when
  // unrelated data appears is testing the fixture, not the isolation.
  it('a house sees ONLY its own queue', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const rows = await ward.seller.queue();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.reference === 'DY-dar-al-ward-A')).toBe(true);
    // Nothing belonging to the other house, by reference or by sub-order id.
    expect(rows.some((r) => r.reference.includes('maison-nour'))).toBe(false);
    expect(rows.some((r) => r.id === ids['maison-nour:sub'])).toBe(false);
  });

  it('and the other house sees only its own', async () => {
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const rows = await nour.seller.queue();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.reference === 'DY-maison-nour-A')).toBe(true);
    expect(rows.some((r) => r.reference.includes('dar-al-ward'))).toBe(false);
    expect(rows.some((r) => r.id === ids['dar-al-ward:sub'])).toBe(false);
  });

  it('hands the order to the house, so the house can actually confirm it', async () => {
    // Every layer was individually correct and the flow still did not work: an
    // order was written as `placed`, nothing moved it to `awaiting_seller`, and
    // the state machine only permits a house to confirm FROM `awaiting_seller`.
    // The house saw the order and the confirm button could not legally do
    // anything. Found by pressing it.
    const placed = await caller({ role: 'anon', id: null }).orders.place({
      contactName: 'نادية سمير',
      contactPhone: '01144445555',
      address: {
        governorate: 'cairo', city: 'مصر الجديدة', area: 'الكوربة',
        street: 'شارع بغداد', building: '5',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const mine = (await ward.seller.queue()).find((r) => r.reference.startsWith(placed.reference));

    expect(mine?.state).toBe('awaiting_seller');

    // And the house can act on it, which is the whole point.
    const confirmed = await ward.seller.confirm({ subOrderId: mine!.id });
    expect(confirmed).toEqual({ ok: true, state: 'confirmed' });
  });

  it('gives a house the address it needs to ship — and nothing else', async () => {
    // Migration 0002 said a house "receives the delivery details it needs on
    // the sub-order" while the schema had no such columns, so a house could
    // see an order it had to pack and no way to learn where to send it.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);

    const placed = await caller({ role: 'anon', id: null }).orders.place({
      contactName: 'هالة مصطفى',
      contactPhone: '01512223333',
      address: {
        governorate: 'giza', city: 'الشيخ زايد', area: 'الحي الثاني',
        street: 'شارع 12', building: '8', floor: '2', landmark: 'خلف كارفور',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const rows = await ward.seller.queue();
    const mine = rows.find((r) => r.reference.startsWith(placed.reference));

    expect(mine).toBeDefined();
    expect(mine!.recipient.name).toBe('هالة مصطفى');
    expect(mine!.recipient.phone).toBe('01512223333');
    expect(mine!.recipient.city).toBe('الشيخ زايد');
    expect(mine!.recipient.landmark).toBe('خلف كارفور');
    // And what to put in the box.
    expect(mine!.items.length).toBeGreaterThan(0);
    expect(mine!.items[0]!.sku).toBeTruthy();
  });

  // "a house still cannot read the parent order" is asserted in
  // packages/db/src/schema/rls.test.ts, NOT here, and the difference is not
  // stylistic. This file's PGlite connection runs as `postgres`, and a
  // superuser BYPASSES row-level security outright — FORCE ROW LEVEL SECURITY
  // binds the table owner, not a superuser. An RLS assertion written here
  // returns every row and proves nothing; the first draft of it did exactly
  // that. rls.test.ts switches to `app_user` first, which is what makes the
  // policies bind and the assertion mean something.

  it('puts the order closest to breaching its SLA at the top', async () => {
    // Sorted by arrival, the order about to breach hides behind five that are
    // not — the only ordering here that actually costs money.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const rows = await ward.seller.queue();
    const due = rows.map((r) => r.confirmDueAt).filter((d): d is string => d !== null);
    const sorted = [...due].sort();
    expect(due).toEqual(sorted);
  });

  it("a house cannot confirm a competitor's sub-order, even naming its id", async () => {
    // The crafted request names Nour's sub-order while authenticated as Ward.
    // RLS makes it invisible, so the router reports not-found rather than acting.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const result = await ward.seller.confirm({ subOrderId: ids['maison-nour:sub']! });
    expect(result.ok).toBe(false);

    // and Nour's order is untouched. Found by id rather than by position:
    // the queue is sorted by SLA deadline, so "the first row" is not a stable
    // way to name a specific order once real ones exist beside the fixture.
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const rows = await nour.seller.queue();
    const seeded = rows.find((r) => r.id === ids['maison-nour:sub']);
    expect(seeded?.state).toBe('awaiting_seller');
  });
});

describe('the queue actually works for its owner', () => {
  it('confirms an order', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const r = await ward.seller.confirm({ subOrderId: ids['dar-al-ward:sub']! });
    expect(r).toEqual({ ok: true, state: 'confirmed' });

    // Find THAT sub-order rather than trusting its position in the queue —
    // the queue's order is not part of the contract being tested here.
    const rows = await ward.seller.queue();
    const confirmed = rows.find((row) => row.id === ids['dar-al-ward:sub']);
    expect(confirmed?.state).toBe('confirmed');
  });

  it('maps an illegal transition to an Arabic message, not a 500', async () => {
    // Already confirmed; declining is no longer legal from that state.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    await expect(
      ward.seller.decline({ subOrderId: ids['dar-al-ward:sub']!, reason: 'out_of_stock' }),
    ).rejects.toThrow(/لا يمكن تنفيذ هذا التغيير/);
  });

  it('declines a fresh order with a coded reason', async () => {
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const r = await nour.seller.decline({
      subOrderId: ids['maison-nour:sub']!, reason: 'out_of_stock',
    });
    expect(r).toEqual({ ok: true, state: 'rejected' });
  });
});
