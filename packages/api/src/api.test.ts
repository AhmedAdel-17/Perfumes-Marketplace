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
import { applyMigrations } from '@diyar/db/migrate';
import { appRouter } from './routers/index';
import { placeOrderSchema, declineSchema, phoneSchema } from './validation';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';

const MIGRATIONS = join(import.meta.dirname, '../../db/migrations');
const CLOCK = new FixedClock(new Date('2026-09-02T09:00:00Z'));
const MEDIA = testMediaStore();

let pg: PGlite;
let db: DiyarDatabase;

const WARD_STAFF = '11111111-1111-1111-1111-111111111111';
const NOUR_STAFF = '33333333-3333-3333-3333-333333333333';
const PLATFORM = '99999999-9999-9999-9999-999999999999';

const ids: Record<string, string> = {};

/** Matches the products seeded below. */
const MAX_STOCK = 25;

const caller = (
  actor: ActorContext,
  sellerId: string | null = null,
  platform: { staffId: string; role: string; label?: string } | null = null,
) => {
  const ctx: ApiContext = {
    actor,
    sellerId,
    platformStaffId: platform?.staffId ?? null,
    platformRole: platform?.role ?? null,
    platformLabel: platform?.label ?? null,
    uow: new DrizzleUnitOfWork(db, actor),
    checkoutUow: new DrizzleUnitOfWork(db, { role: 'checkout', id: null }),
    aftercareUow: new DrizzleUnitOfWork(db, { role: 'aftercare', id: null }),
    intakeUow: new DrizzleUnitOfWork(db, { role: 'intake', id: null }),
    analyticsUow: new DrizzleUnitOfWork(db, { role: 'analytics', id: null }),
    media: MEDIA,
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  // Seed as platform so the RLS policies permit it.
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  // An operator, because an audited decision records WHO made it and the
  // column is a foreign key. Without one, every audit case skipped.
  await pg.query(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'مشغّلة المنصّة','01000000001','admin')`, [PLATFORM]);

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
         delivery_fulfilled_by,recipient_name,recipient_phone,governorate,city,area,street,building)
       VALUES ($1,$2,$3,38000,5000,'awaiting_seller','seller',
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

  it('shows no photograph for a primary row that never came through verification', async () => {
    // The seeded primary is 'p.jpg' with no facts — the shape rows had before
    // the upload flow. It satisfies the publish trigger; it is not a picture.
    const cart = await caller(ANON).cart.price({
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
    });
    expect(cart.houses[0]!.lines[0]!.photo).toBeNull();
  });

  it('gives a visitor the public address of a verified primary photograph', async () => {
    // Priced as ANON on purpose: the snapshot reads `product_media` in the
    // visitor's own transaction, so this also proves row-level security lets
    // anonymous traffic see a published product's photograph. A policy that
    // did not would not fail — the left join would quietly return no picture.
    const productId = ids['maison-nour:product']!;
    const key = `products/${productId}/${'a'.repeat(24)}.jpg`;

    await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
    await pg.query(
      `UPDATE product_media SET storage_path=$2, content_type='image/jpeg', byte_size=180000, width=1000, height=1250
       WHERE product_id=$1 AND is_primary`, [productId, key]);
    await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);

    try {
      const cart = await caller(ANON).cart.price({ lines: [{ productId, quantity: 1 }] });
      expect(cart.houses[0]!.lines[0]!.photo).toEqual({
        url: MEDIA.publicUrl(key), alt: 'زجاجة', width: 1000, height: 1250,
      });
    } finally {
      // Put the seed back: later cases in this file read this product.
      await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
      await pg.query(
        `UPDATE product_media SET storage_path='p.jpg', content_type=NULL, byte_size=NULL, width=NULL, height=NULL
         WHERE product_id=$1 AND is_primary`, [productId]);
      await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
    }
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
  it('reaches the CALLER in Arabic, not as a 500', async () => {
    /*
     * The cases below exercise the schemas directly, which is where they were
     * all written — so nobody had asked what a caller actually receives when
     * one fails through the router. The answer was a 500 saying "something went
     * wrong": every Arabic message in this package was being thrown away, and
     * the customer was told the server had broken when their phone number had a
     * digit missing.
     */
    await expect(
      caller({ role: 'anon', id: null }).orders.place({
        contactName: 'أحمد',
        contactPhone: '12345',
        address: {
          governorate: 'cairo', city: 'ن', area: 'ح', street: 'ش', building: '1',
        },
        lines: [{ productId: crypto.randomUUID(), quantity: 1 }],
        paymentMethod: 'cod',
      } as never),
    ).rejects.toThrow('رقم هاتف مصري غير صالح');
  });

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

  it('carries an order all the way to dispatched, with a real parcel behind it', async () => {
    const anon = caller({ role: 'anon', id: null });
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);

    const placed = await anon.orders.place({
      contactName: 'رانيا فتحي',
      contactPhone: '01566667777',
      address: {
        governorate: 'alexandria', city: 'سيدي جابر', area: 'كليوباترا',
        street: 'شارع أبو قير', building: '30',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const row = (await ward.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await ward.seller.confirm({ subOrderId: row.id });

    const dispatched = await ward.seller.dispatch({
      subOrderId: row.id,
      // As a human types it off a label: lowercase, with a hyphen.
      trackingNumber: 'bst-9988 7766',
    });
    expect(dispatched.ok).toBe(true);
    expect(dispatched.trackingNumber).toBe('BST99887766');

    const after = (await ward.seller.queue()).find((r) => r.id === row.id);
    expect(after?.state).toBe('dispatched');
    expect(after?.trackingNumber).toBe('BST99887766');
  });

  it('refuses to dispatch from a state the machine forbids', async () => {
    // A parcel cannot leave before the house has confirmed it. If the guard ran
    // after the write, an illegal dispatch would still leave a shipment behind.
    const anon = caller({ role: 'anon', id: null });
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);

    const placed = await anon.orders.place({
      contactName: 'رانيا فتحي',
      contactPhone: '01566667777',
      address: {
        governorate: 'alexandria', city: 'سيدي جابر', area: 'كليوباترا',
        street: 'شارع أبو قير', building: '30',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const row = (await ward.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    // Still awaiting_seller — never confirmed.
    await expect(ward.seller.dispatch({
      subOrderId: row.id, trackingNumber: 'BST11112222',
    })).rejects.toThrow(/لا يمكن تنفيذ هذا التغيير/);

    const after = (await ward.seller.queue()).find((r) => r.id === row.id);
    expect(after?.state).toBe('awaiting_seller');
    expect(after?.trackingNumber).toBeNull();
  });

  it('refuses an unusable tracking number rather than storing rubbish', async () => {
    const anon = caller({ role: 'anon', id: null });
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);

    const placed = await anon.orders.place({
      contactName: 'رانيا فتحي',
      contactPhone: '01566667777',
      address: {
        governorate: 'alexandria', city: 'سيدي جابر', area: 'كليوباترا',
        street: 'شارع أبو قير', building: '30',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const row = (await ward.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await ward.seller.confirm({ subOrderId: row.id });

    await expect(ward.seller.dispatch({
      subOrderId: row.id, trackingNumber: 'BST/1234',
    })).rejects.toThrow();

    // And the order did not move, so a rejected dispatch leaves no trace.
    const after = (await ward.seller.queue()).find((r) => r.id === row.id);
    expect(after?.state).toBe('confirmed');
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
    //
    // By the deadline each order is racing NOW: confirmation while it waits
    // for the house, dispatch once confirmed. The first version compared
    // confirmation deadlines across every row, which stays true even when a
    // confirmed parcel due tonight is listed below one due next week.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const rows = await ward.seller.queue();
    const active = rows
      .map((r) => (r.state === 'confirmed' ? r.dispatchDueAt : r.confirmDueAt))
      .filter((d): d is string => d !== null);
    expect(active).toEqual([...active].sort());
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

    /*
     * Confirming starts the dispatch clock.
     *
     * The fixture's houses are inserted without naming a dispatch window, so
     * 0020's trigger snapshots the house's own setting — the table default of
     * 48 hours — onto the sub-order. Confirmed at CLOCK (2 Sept, 09:00 UTC), it
     * must be shipped by 4 Sept, 09:00. Before 0020 this field did not exist on
     * the queue and the column behind it had never been written.
     */
    expect(confirmed?.dispatchDueAt).toBe('2026-09-04T09:00:00.000Z');
  });

  it('an order still awaiting confirmation has no dispatch deadline yet', async () => {
    // A house cannot be late shipping an order it has not agreed to take.
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const rows = await nour.seller.queue();
    const waiting = rows.find((row) => row.id === ids['maison-nour:sub']);
    expect(waiting?.state).toBe('awaiting_seller');
    expect(waiting?.dispatchDueAt).toBeNull();
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

describe('the parcel reaches the customer tracking page', () => {
  const ANON: ActorContext = { role: 'anon', id: null };

  it('shows the tracking number once the house has dispatched', async () => {
    // Order tracking runs as the `checkout` role, which could read the order
    // and the sub-orders but not the shipment — so a dispatched order said
    // "in transit" and gave no way to find the parcel, which is the one thing
    // the customer wants at that moment. Migration 0006.
    const anon = caller(ANON);
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);

    const placed = await anon.orders.place({
      contactName: 'ليلى حسن',
      contactPhone: '01188889999',
      address: {
        governorate: 'cairo', city: 'الزمالك', area: 'الجزيرة',
        street: 'شارع 26 يوليو', building: '11',
      },
      lines: [{ productId: ids['maison-nour:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const before = await anon.orders.byReference({
      reference: placed.reference, phone: '01188889999',
    });
    expect(before?.houses[0]!.trackingNumber).toBeNull();

    const row = (await nour.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await nour.seller.confirm({ subOrderId: row.id });
    await nour.seller.dispatch({ subOrderId: row.id, trackingNumber: 'EG-4455 6677' });

    const after = await anon.orders.byReference({
      reference: placed.reference, phone: '01188889999',
    });
    expect(after?.houses[0]!.state).toBe('dispatched');
    expect(after?.houses[0]!.trackingNumber).toBe('EG44556677');
  });
});

/**
 * Reviews, through the whole stack.
 *
 * The homepage has promised "تقييمات موثّقة بالشراء" since the first version of
 * this site. These are what make that a fact rather than a claim: an order is
 * placed, confirmed, dispatched and delivered through the real routers, and
 * only then can anything be written about it.
 *
 * Every refusal below is checked from the OUTSIDE, through the router a browser
 * would reach, because that is where a mistake would actually be exploitable.
 */
describe('reviews — only what you received, and only once', () => {
  const ANON: ActorContext = { role: 'anon', id: null };
  const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
  const OPERATOR = { staffId: '', role: 'admin', label: 'مشغّلة المنصّة' };

  beforeAll(async () => {
    const [staff] = await db.select({ id: schema.platformStaff.id })
      .from(schema.platformStaff).limit(1);
    OPERATOR.staffId = staff!.id;
  });

  /** Place, confirm, dispatch and deliver — through the real routers. */
  const deliveredOrder = async (phone: string, name = 'ليلى محمود حسن') => {
    const anon = caller(ANON);
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    const placed = await anon.orders.place({
      contactName: name,
      contactPhone: phone,
      address: {
        governorate: 'cairo', city: 'الزمالك', area: 'الجزيرة',
        street: 'شارع 26 يوليو', building: '11',
      },
      lines: [{ productId: ids['maison-nour:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const row = (await nour.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await nour.seller.confirm({ subOrderId: row.id });
    await nour.seller.dispatch({ subOrderId: row.id, trackingNumber: `EG-${phone.slice(-6)}` });
    await ops.platform.markDelivered({ subOrderId: row.id });

    return { reference: placed.reference, phone };
  };

  it('offers nothing until the parcel has actually arrived', async () => {
    const anon = caller(ANON);
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);

    const placed = await anon.orders.place({
      contactName: 'سلمى',
      contactPhone: '01155550001',
      address: {
        governorate: 'cairo', city: 'الزمالك', area: 'الجزيرة',
        street: 'شارع 26 يوليو', building: '11',
      },
      lines: [{ productId: ids['maison-nour:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    // Placed, not delivered.
    expect(await anon.reviews.reviewable({
      reference: placed.reference, phone: '01155550001',
    })).toEqual([]);

    // Even after dispatch. A parcel on a van has not been smelled.
    const row = (await nour.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await nour.seller.confirm({ subOrderId: row.id });
    await nour.seller.dispatch({ subOrderId: row.id, trackingNumber: 'EG-55550001' });
    expect(await anon.reviews.reviewable({
      reference: placed.reference, phone: '01155550001',
    })).toEqual([]);
  });

  it('a delivered purchase can be reviewed, and appears on the product', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01155550002');

    const [line] = await anon.reviews.reviewable(order);
    expect(line).toBeDefined();
    expect(line!.reviewed).toBe(false);

    await anon.reviews.submit({
      ...order,
      lineItemId: line!.lineItemId,
      ratings: {
        scent: 5, longevity: 4, projection: 3,
        value: 5, packaging: 5, descriptionAccuracy: 2,
      },
      body: 'الوصف بالغ في الانتشار قليلًا.',
      incentiveDisclosed: false,
    });

    const page = await anon.reviews.forProduct({ productId: line!.productId });
    const mine = page.reviews.find((r) => r.body === 'الوصف بالغ في الانتشار قليلًا.');
    expect(mine).toBeDefined();

    // The byline is masked by the domain, in whichever adapter answered.
    expect(mine!.authorName).toBe('ليلى م.');
    expect(mine!.authorName).not.toContain('حسن');
  });

  it('the WRONG PHONE cannot review, and says nothing about why', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01155550003');
    const [line] = await anon.reviews.reviewable(order);

    // A valid Egyptian number that did not place this order.
    expect(await anon.reviews.reviewable({
      reference: order.reference, phone: '01155559999',
    })).toEqual([]);

    await expect(anon.reviews.submit({
      reference: order.reference,
      phone: '01155559999',
      lineItemId: line!.lineItemId,
      ratings: {
        scent: 1, longevity: 1, projection: 1, value: 1, packaging: 1, descriptionAccuracy: 1,
      },
      body: 'مزيّف',
      incentiveDisclosed: false,
    })).rejects.toThrow('لا يمكن تقييم هذا المنتج الآن');
  });

  it('SOMEBODY ELSE’S line item cannot be reviewed with your own order', async () => {
    /*
     * The case the repository's INSERT ... SELECT exists for. Nothing about
     * identity comes from the request except the line item, and a line item
     * belonging to another order matches no row — so there is no comparison
     * here that a refactor could quietly drop, which is how order lookup came
     * to accept any phone the first time it was written.
     */
    const anon = caller(ANON);
    const mine = await deliveredOrder('01155550004');
    const theirs = await deliveredOrder('01155550005');

    const [theirLine] = await anon.reviews.reviewable(theirs);

    await expect(anon.reviews.submit({
      ...mine,
      lineItemId: theirLine!.lineItemId,
      ratings: {
        scent: 1, longevity: 1, projection: 1, value: 1, packaging: 1, descriptionAccuracy: 1,
      },
      body: null,
      incentiveDisclosed: false,
    })).rejects.toThrow();

    // And it is still reviewable by the person who actually bought it.
    const after = await anon.reviews.reviewable(theirs);
    expect(after.find((l) => l.lineItemId === theirLine!.lineItemId)!.reviewed).toBe(false);
  });

  it('the same purchase cannot be reviewed twice', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01155550006');
    const [line] = await anon.reviews.reviewable(order);

    const write = (body: string) => anon.reviews.submit({
      ...order,
      lineItemId: line!.lineItemId,
      ratings: {
        scent: 4, longevity: 4, projection: 4, value: 4, packaging: 4, descriptionAccuracy: 4,
      },
      body,
      incentiveDisclosed: false,
    });

    await write('الأول');
    await expect(write('الثاني')).rejects.toThrow();

    // The first one survives. A second attempt must not overwrite it.
    const page = await anon.reviews.forProduct({ productId: line!.productId });
    expect(page.reviews.some((r) => r.body === 'الأول')).toBe(true);
    expect(page.reviews.some((r) => r.body === 'الثاني')).toBe(false);
  });

  it('refuses a half star and a rating off the scale, in Arabic', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01155550007');
    const [line] = await anon.reviews.reviewable(order);

    const submit = (ratings: Record<string, number>) => anon.reviews.submit({
      ...order,
      lineItemId: line!.lineItemId,
      ratings: ratings as never,
      body: null,
      incentiveDisclosed: false,
    });

    await expect(submit({
      scent: 4.5, longevity: 4, projection: 4, value: 4, packaging: 4, descriptionAccuracy: 4,
    })).rejects.toThrow();
    await expect(submit({
      scent: 9, longevity: 4, projection: 4, value: 4, packaging: 4, descriptionAccuracy: 4,
    })).rejects.toThrow();

    // Refused at the boundary, so nothing reached the table.
    const page = await anon.reviews.forProduct({ productId: line!.productId });
    expect(page.reviews.every((r) => r.ratings.scent <= 5)).toBe(true);
  });

  it('an unreviewed perfume summarises to NOTHING, not to zero', async () => {
    const anon = caller(ANON);
    // The other house's listing, which nothing in this suite reviews.
    const page = await anon.reviews.forProduct({ productId: ids['dar-al-ward:product']! });
    expect(page.summary.count).toBe(0);
    expect(page.summary.overall).toBeNull();
  });

  it('hiding removes it from the shopfront, records who and why, and can be undone', async () => {
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const order = await deliveredOrder('01155550008');
    const [line] = await anon.reviews.reviewable(order);

    const marker = 'نص مسيء للاختبار';
    await anon.reviews.submit({
      ...order,
      lineItemId: line!.lineItemId,
      ratings: {
        scent: 1, longevity: 1, projection: 1, value: 1, packaging: 1, descriptionAccuracy: 1,
      },
      body: marker,
      incentiveDisclosed: false,
    });

    const queued = (await ops.reviews.queue()).find((r) => r.body === marker)!;
    expect(queued).toBeDefined();

    await ops.reviews.hide({ id: queued.id, note: 'لغة مسيئة' });

    // Gone from the public page.
    const page = await anon.reviews.forProduct({ productId: line!.productId });
    expect(page.reviews.some((r) => r.body === marker)).toBe(false);

    // Still in the record, with the reason and a note of who removed it.
    const stillThere = (await ops.reviews.queue()).find((r) => r.id === queued.id)!;
    expect(stillThere.body).toBe(marker);
    expect(stillThere.moderationNote).toBe('لغة مسيئة');
    expect(stillThere.hiddenAt).not.toBeNull();

    // And in the audit trail, in the same transaction as the decision. Read
    // through the repository, as the other audit cases here do — there is no
    // console procedure for reading the trail yet.
    const [entry] = await new DrizzleUnitOfWork(db, PLATFORM_ACTOR)
      .transaction((r) => r.audit.recent({ entityTable: 'reviews', entityId: queued.id }));
    expect(entry, 'hiding a review wrote no audit entry').toBeDefined();
    expect(entry!.action).toBe('review_moderation');
    expect(entry!.actorLabel).toBe('مشغّلة المنصّة');
    expect(JSON.parse(entry!.after!).note).toBe('لغة مسيئة');

    // Reversible, because a moderator can be wrong too.
    await ops.reviews.restore({ id: queued.id });
    const restored = await anon.reviews.forProduct({ productId: line!.productId });
    expect(restored.reviews.some((r) => r.body === marker)).toBe(true);
  });

  it('refuses to hide anything without a written reason', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const any = (await ops.reviews.queue())[0]!;
    // The note is the only thing separating moderation from suppression.
    await expect(ops.reviews.hide({ id: any.id, note: '   ' })).rejects.toThrow();
  });

  it('a HOUSE cannot moderate a review, or read the queue', async () => {
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const any = (await ops.reviews.queue())[0]!;

    // Doc 04 §3: brands cannot delete or privately suppress negative reviews.
    await expect(nour.reviews.queue()).rejects.toThrow();
    await expect(nour.reviews.hide({ id: any.id, note: 'لا يعجبني' })).rejects.toThrow();
    await expect(nour.reviews.restore({ id: any.id })).rejects.toThrow();
  });
});

/**
 * The audit trail, written by the decisions doc 04 §8 names.
 *
 * The table has existed since the first migration and nothing had ever written
 * to it — which is worse than not having one, because a schema that promises an
 * audit trail is read as having one. These are what say it now does.
 *
 * Every case reads the trail back through the SAME api the console would, and
 * asserts on what an auditor would actually need: who, what, and enough of the
 * before and after to see what moved.
 */
describe('the audit trail records who decided what', () => {
  const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
  const OPERATOR = { staffId: '', role: 'admin', label: 'مشغّلة المنصّة' };

  beforeAll(async () => {
    const [staff] = await db.select({ id: schema.platformStaff.id })
      .from(schema.platformStaff).limit(1);
    OPERATOR.staffId = staff!.id;
  });

  const trail = async (entityTable: string, entityId: string) =>
    (await new DrizzleUnitOfWork(db, PLATFORM_ACTOR)
      .transaction((r) => r.audit.recent({ entityTable, entityId })));

  it('records a payout, with the numbers that were released', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const result = await ops.platform.runPayout({
      sellerId: ids['dar-al-ward']!,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-30T00:00:00.000Z',
    });

    const [entry] = await trail('payouts', result.payoutId);
    expect(entry, 'a payout wrote no audit entry').toBeDefined();
    expect(entry!.action).toBe('payout_approval');
    expect(entry!.actorId).toBe(OPERATOR.staffId);

    // The NAME, captured at the time. An id that later resolves to "unknown
    // staff member" answers none of the questions an audit exists to answer.
    expect(entry!.actorLabel).toBe(OPERATOR.label);

    const after = JSON.parse(entry!.after!);
    expect(after.netPiastres).toBe(result.netPiastres);
    expect(after.grossPiastres).toBe(result.grossPiastres);
    expect(after.sellerId).toBe(ids['dar-al-ward']);
  });

  it('records a listing decision, with the state it moved from and to', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const listing = await ward.listings.create({
      name: 'عطر للتدقيق',
      slug: `audit-${Date.now().toString(36)}`,
      sku: `AUD-${Date.now().toString(36)}`,
      brandId: (await ward.listings.myBrand())!.id,
    });

    // Straight to the platform's decision: the point here is the entry, not
    // the route a house takes to the queue.
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    await ops.listings.decide({ id: listing.id, to: 'archived', reason: null });

    const [entry] = await trail('products', listing.id);
    expect(entry, 'a moderation decision wrote no audit entry').toBeDefined();
    expect(entry!.action).toBe('listing_moderation');
    expect(JSON.parse(entry!.before!)).toEqual({ status: 'draft' });
    expect(JSON.parse(entry!.after!).status).toBe('archived');
  });

  it('records who published a policy page', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const page = await ops.content.create({
      slug: `terms-${Date.now().toString(36)}`, title: 'الشروط',
    });
    await ops.content.saveDraft({
      id: page.id,
      title: 'الشروط',
      blocks: [{ kind: 'heading', level: 2, text: 'الشروط' }],
    });
    await ops.content.move({ id: page.id, to: 'in_review' });
    await ops.content.move({ id: page.id, to: 'published' });

    const entries = await trail('content_pages', page.id);
    expect(entries.length, 'publishing a policy page wrote no audit entry')
      .toBeGreaterThan(0);
    expect(entries[0]!.action).toBe('policy_change');
    expect(entries[0]!.actorLabel).toBe(OPERATOR.label);
  });

  it('keeps the trail in the same transaction as the decision', async () => {
    /*
     * A decision that committed while its audit entry failed is a decision
     * nobody can account for, and nothing would say so.
     *
     * Proved from the other side: a decision that FAILS must leave no entry
     * behind. Moving a draft straight to `published` is illegal, so the domain
     * throws before anything is written.
     */
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const listing = await ward.listings.create({
      name: 'عطر مرفوض',
      slug: `reject-${Date.now().toString(36)}`,
      sku: `REJ-${Date.now().toString(36)}`,
      brandId: (await ward.listings.myBrand())!.id,
    });

    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    await expect(
      ops.listings.decide({ id: listing.id, to: 'published', reason: null }),
    ).rejects.toThrow();

    expect(await trail('products', listing.id)).toEqual([]);
  });
});

/**
 * Reading the trail through the console's own procedure.
 *
 * The cases above read through the repository, which is what an auditor with
 * SQL would do. These read through `audit.recent`, which is what an operator
 * with a browser does — the second half of gate 6.
 */
describe('the audit trail can be read without database work', () => {
  const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
  const OPERATOR = { staffId: '', role: 'admin', label: 'مشغّلة المنصّة' };

  beforeAll(async () => {
    const [staff] = await db.select({ id: schema.platformStaff.id })
      .from(schema.platformStaff).limit(1);
    OPERATOR.staffId = staff!.id;

    // At least two entries of one kind, whatever ran before this block.
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    for (let i = 0; i < 2; i += 1) {
      await ops.platform.runPayout({
        sellerId: ids['dar-al-ward']!,
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-30T00:00:00.000Z',
      });
    }
  });

  it('an operator reads the newest decisions, with who made them', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const { entries } = await ops.audit.recent({});

    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0]!.actorLabel).toBe(OPERATOR.label);
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i]!.occurredAt <= entries[i - 1]!.occurredAt).toBe(true);
    }
  });

  it('offers an older page only when there is one, and the page is different', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const first = await ops.audit.recent({ action: 'payout_approval', limit: 1 });
    expect(first.nextBefore, 'two payouts exist, so a second page must be offered').not.toBeNull();

    const second = await ops.audit.recent({
      action: 'payout_approval', limit: 1, before: first.nextBefore!,
    });
    expect(second.entries[0]!.id).not.toBe(first.entries[0]!.id);

    // And at the end of the trail, no "older" link that leads to an empty page.
    const all = await ops.audit.recent({ action: 'payout_approval', limit: 100 });
    expect(all.nextBefore).toBeNull();
  });

  it('narrows to one kind of decision', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const { entries } = await ops.audit.recent({ action: 'payout_approval' });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((entry) => entry.action === 'payout_approval')).toBe(true);
  });

  it('a HOUSE cannot read the trail', async () => {
    // The trail records decisions ABOUT houses, including other houses'
    // payouts. Refused at the procedure, and 0002 gives sellers no policy on
    // the table, so this is the first of two locks.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    await expect(ward.audit.recent({})).rejects.toThrow();
  });

  it('nobody signed out can read it', async () => {
    await expect(caller({ role: 'anon', id: null }).audit.recent({})).rejects.toThrow();
  });

  it('has no procedure that writes — entries are written by the decisions they record', () => {
    /*
     * A console that could add, amend or annotate an entry after the fact is a
     * console for rewriting what happened. The table already refuses UPDATE and
     * DELETE; this keeps the API from growing a way around that by INSERTing a
     * "correction" nobody decided.
     */
    // Through `unknown`: the flat procedure map is typed as the nested router
    // shape, and only the flat map carries `_def.type` per path.
    const flat = appRouter._def.procedures as unknown as Record<string, { _def: { type: string } }>;
    const procedures = Object.entries(flat)
      .filter(([path]) => path.startsWith('audit.'));
    expect(procedures.length).toBeGreaterThan(0);
    for (const [path, procedure] of procedures) {
      expect(procedure._def.type, `${path} is not a query`).toBe('query');
    }
  });
});

/**
 * The owner's report through the procedure a browser reaches — gate 8.
 *
 * The figures themselves are proved in `insights/owner-metrics.test.ts`, and
 * the facts behind them in the owner-report contract. What is proved here is
 * the door: who may open it, and what shape comes out of it.
 */
describe('the owner’s report', () => {
  const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
  const ADMIN = { staffId: '', role: 'admin', label: 'مشغّلة المنصّة' };

  beforeAll(async () => {
    const [staff] = await db.select({ id: schema.platformStaff.id })
      .from(schema.platformStaff).limit(1);
    ADMIN.staffId = staff!.id;
  });

  it('an admin reads the last 30 days by default, every section present', async () => {
    const report = await caller(PLATFORM_ACTOR, null, ADMIN).insights.owner({});

    expect(report.days).toBe(30);
    expect(new Date(report.from).getTime()).toBeLessThan(new Date(report.to).getTime());
    expect(Array.isArray(report.sla)).toBe(true);
    expect(report.contributionInputs.map((i) => i.key)).toContain('payment_cost');
    expect(report.funnel).toHaveProperty('exits.refused');
  });

  it('serialises an unrecorded cost with NO amount — the API never invents a zero', async () => {
    const report = await caller(PLATFORM_ACTOR, null, ADMIN).insights.owner({ days: 7 });
    const payment = report.contributionInputs.find((i) => i.key === 'payment_cost')!;
    expect(payment.status).toBe('not_recorded');
    expect(payment.amountPiastres).toBeNull();
  });

  it('an operator who is not an admin is refused — margins are not every operator’s business', async () => {
    const operator = { ...ADMIN, role: 'operator' };
    await expect(caller(PLATFORM_ACTOR, null, operator).insights.owner({}))
      .rejects.toThrow(/لإدارة المنصّة فقط/);
  });

  it('a house cannot read it', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    await expect(ward.insights.owner({})).rejects.toThrow();
  });

  it('nobody signed out can read it', async () => {
    await expect(caller({ role: 'anon', id: null }).insights.owner({})).rejects.toThrow();
  });

  it('refuses a period it does not offer', async () => {
    // Four periods, all whole Cairo days. An arbitrary span would be a report
    // nobody could reproduce from the screen.
    await expect(
      caller(PLATFORM_ACTOR, null, ADMIN).insights.owner({ days: 5 as unknown as 7 }),
    ).rejects.toThrow();
  });
});

describe('the money loop — order to payout, against a real Postgres', () => {
  const ANON: ActorContext = { role: 'anon', id: null };
  const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };

  /** Places, confirms and dispatches one order for Ward. Returns its sub-order. */
  const shipOne = async () => {
    const anon = caller(ANON);
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);

    const placed = await anon.orders.place({
      contactName: 'سلمى راضي',
      contactPhone: '01099887766',
      address: {
        governorate: 'cairo', city: 'حلوان', area: 'عين حلوان',
        street: 'شارع المنصور', building: '9',
      },
      lines: [{ productId: ids['dar-al-ward:product']!, quantity: 1 }],
      paymentMethod: 'cod',
    });

    const row = (await ward.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
    await ward.seller.confirm({ subOrderId: row.id });
    await ward.seller.dispatch({ subOrderId: row.id, trackingNumber: `BST${Date.now()}` });
    return { row, placed, ward };
  };

  it('refuses to let a HOUSE declare its own order delivered', async () => {
    // The whole reason delivery is platform-only: a house that could mark its
    // own order delivered would start its own reserve clock and trigger its own
    // payout on its own say-so. The state machine excludes `seller` from this
    // transition, and there is no seller procedure that performs it.
    const { row, ward } = await shipOne();
    expect('markDelivered' in ward.seller).toBe(false);

    // And the platform path does work, so this is a refusal rather than a gap.
    const delivered = await caller(PLATFORM_ACTOR).platform.markDelivered({ subOrderId: row.id });
    expect(delivered).toEqual({ ok: true, state: 'delivered' });
  });

  it('holds the money until the courier has actually remitted', async () => {
    // "Never pay faster than you are paid" (doc 03 §10). Delivery and cash are
    // separate events days apart; collapsing them pays houses for money the
    // marketplace does not yet hold.
    const { row } = await shipOne();
    const platform = caller(PLATFORM_ACTOR);
    await platform.platform.markDelivered({ subOrderId: row.id });

    const beforeRemittance = await platform.platform.runPayout({
      sellerId: ids['dar-al-ward']!,
      periodStart: new Date('2026-09-01T00:00:00Z').toISOString(),
      periodEnd: new Date('2026-09-30T00:00:00Z').toISOString(),
    });

    // Delivered but unremitted: gross is held, so nothing is owed yet.
    expect(beforeRemittance.heldGrossPiastres).toBeGreaterThan(0);
  });

  it('produces a statement whose lines reconcile to its own total', async () => {
    const { row } = await shipOne();
    const platform = caller(PLATFORM_ACTOR);
    await platform.platform.markDelivered({ subOrderId: row.id });
    await platform.platform.recordRemittance({
      subOrderId: row.id,
      collectedPiastres: 43_500,
    });

    const run = await platform.platform.runPayout({
      sellerId: ids['dar-al-ward']!,
      periodStart: new Date('2026-09-01T00:00:00Z').toISOString(),
      periodEnd: new Date('2026-09-30T00:00:00Z').toISOString(),
    });

    // The house reads it back itself, which is the only view that matters.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const statement = await ward.seller.statement({ payoutId: run.payoutId });

    expect(statement).not.toBeNull();
    // Every line adds up to the header. A payout whose lines disagree with its
    // own total destroys the trust the commission model rests on, quietly.
    const lineNet = statement!.lines.reduce((sum, l) => sum + l.netPiastres, 0);
    const lineGross = statement!.lines.reduce((sum, l) => sum + l.grossPiastres, 0);
    const lineCommission = statement!.lines.reduce((sum, l) => sum + l.commissionPiastres, 0);
    expect(lineNet).toBe(statement!.netPiastres);
    expect(lineGross).toBe(statement!.grossPiastres);
    expect(lineCommission).toBe(statement!.commissionPiastres);

    // And commission was actually charged, at the snapshotted rate.
    expect(statement!.commissionPiastres).toBeGreaterThan(0);
    expect(statement!.lines[0]!.commissionBps).toBeGreaterThan(0);
    expect(statement!.disputeDeadline).not.toBeNull();
  });

  it('shows a house only its OWN payouts', async () => {
    const platform = caller(PLATFORM_ACTOR);
    await platform.platform.runPayout({
      sellerId: ids['dar-al-ward']!,
      periodStart: new Date('2026-09-01T00:00:00Z').toISOString(),
      periodEnd: new Date('2026-09-30T00:00:00Z').toISOString(),
    });

    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const wardPayouts = await caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward'])
      .seller.payouts();

    expect(wardPayouts.length).toBeGreaterThan(0);
    // Nour sees none of Ward's, and asking for one by id reads as not-found
    // rather than as someone else's money.
    const nourPayouts = await nour.seller.payouts();
    expect(nourPayouts.some((p) => wardPayouts.some((w) => w.id === p.id))).toBe(false);

    const stolen = await nour.seller.statement({ payoutId: wardPayouts[0]!.id });
    expect(stolen).toBeNull();
  });
});

/**
 * A house adding photographs — WORK_PLAN 5.7.3, through the procedures the
 * console calls, against a real Postgres and the local media store.
 *
 * The browser's half (PUT to the signed URL) is simulated by writing the bytes
 * straight into the test store; everything the SERVER does with them is real.
 */
describe('a house adds photographs to its own listing', () => {
  const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

  /** A real JPEG header: SOI, JFIF, a baseline frame at the given size. */
  const jpeg = (width: number, height: number) => new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda,
  ]);

  const ward = () => caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
  const nour = () => caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);

  const newListing = async () => {
    const house = ward();
    const suffix = Math.random().toString(36).slice(2, 8);
    return house.listings.create({
      name: 'عطر للصور', slug: `photos-${suffix}`, sku: `PHO-${suffix}`,
      brandId: (await house.listings.myBrand())!.id,
    });
  };

  const described = { alt: 'زجاجة على رخام أسود', ownershipConfirmed: true };

  /** Start an upload and put the bytes where the URL points. */
  const upload = async (productId: string, bytes: Uint8Array) => {
    const started = await ward().photos.startUpload({
      productId, contentType: 'image/jpeg', byteSize: bytes.length,
    });
    await MEDIA.write(started.key, bytes);
    return started.key;
  };

  const confirm = (productId: string, key: string, details = described) =>
    ward().photos.confirm({ productId, key, ...details });

  it('uploads, verifies what arrived, and lists it with its real dimensions', async () => {
    const listing = await newListing();
    const started = await ward().photos.startUpload({
      productId: listing.id, contentType: 'image/jpeg', byteSize: 4_000,
    });

    expect(started.key.startsWith(`products/${listing.id}/`)).toBe(true);
    expect(started.url).toContain('signature=');

    await MEDIA.write(started.key, jpeg(2400, 3000));
    const photo = await confirm(listing.id, started.key);

    expect(photo.isPrimary).toBe(true);
    expect([photo.width, photo.height]).toEqual([2400, 3000]);
    expect(photo.url).toContain(started.key);

    const listed = await ward().photos.list({ productId: listing.id });
    expect(listed.map((p) => p.id)).toEqual([photo.id]);

    // And the listing gap closes: this is the photograph the publish rule wants.
    const draft = await ward().listings.get({ id: listing.id });
    expect(draft.primaryImage).toBe(true);
  });

  it('confirming the same upload twice returns the SAME photograph, not a second', async () => {
    const listing = await newListing();
    const key = await upload(listing.id, jpeg(2400, 3000));
    const first = await confirm(listing.id, key);
    const second = await confirm(listing.id, key);
    expect(second.id).toBe(first.id);
    expect(await ward().photos.list({ productId: listing.id })).toHaveLength(1);
  });

  it('refuses a web page called photo.jpg, and deletes it from storage', async () => {
    const listing = await newListing();
    const key = await upload(listing.id, new TextEncoder().encode('<!doctype html><script>alert(1)</script>'));

    await expect(confirm(listing.id, key)).rejects.toThrow(/ليس صورة يمكن عرضها/);
    expect(await MEDIA.describe(key)).toBeNull();
    expect(await ward().photos.list({ productId: listing.id })).toHaveLength(0);
  });

  it('refuses a photograph too small to stay sharp, and deletes it', async () => {
    const listing = await newListing();
    const key = await upload(listing.id, jpeg(600, 900));

    await expect(confirm(listing.id, key)).rejects.toThrow(/800 بكسل/);
    expect(await MEDIA.describe(key)).toBeNull();
  });

  it('refuses a blank description but KEEPS the file, so the house need not upload it twice', async () => {
    const listing = await newListing();
    const key = await upload(listing.id, jpeg(2400, 3000));

    await expect(confirm(listing.id, key, { alt: '   ', ownershipConfirmed: true }))
      .rejects.toThrow(/اكتب وصفًا/);
    expect(await MEDIA.describe(key)).not.toBeNull();

    const photo = await confirm(listing.id, key, { alt: 'العلبة من الأمام', ownershipConfirmed: true });
    expect(photo.alt).toBe('العلبة من الأمام');
  });

  it('refuses a key issued for a DIFFERENT product', async () => {
    const mine = await newListing();
    const other = await newListing();
    const key = await upload(other.id, jpeg(2400, 3000));

    await expect(confirm(mine.id, key)).rejects.toThrow(/رابط الصورة غير صالح/);
  });

  it('another house can neither see nor add photographs to this listing', async () => {
    const listing = await newListing();
    await expect(nour().photos.list({ productId: listing.id })).rejects.toThrow(/غير موجود/);
    await expect(nour().photos.startUpload({
      productId: listing.id, contentType: 'image/jpeg', byteSize: 4_000,
    })).rejects.toThrow(/غير موجود/);
  });

  it('refuses an oversized file before signing anything', async () => {
    const listing = await newListing();
    await expect(ward().photos.startUpload({
      productId: listing.id, contentType: 'image/jpeg', byteSize: 11 * 1024 * 1024,
    })).rejects.toThrow(/10 ميجابايت/);
  });

  it('makes another photograph primary, reorders, and promotes the next when a draft loses its primary', async () => {
    const listing = await newListing();
    const a = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    const b = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    const c = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));

    await ward().photos.makePrimary({ productId: listing.id, photoId: b.id });
    await ward().photos.reorder({ productId: listing.id, photoIds: [c.id, b.id, a.id] });
    let listed = await ward().photos.list({ productId: listing.id });
    expect(listed.map((p) => p.id)).toEqual([c.id, b.id, a.id]);
    expect(listed.filter((p) => p.isPrimary).map((p) => p.id)).toEqual([b.id]);

    await ward().photos.remove({ productId: listing.id, photoId: b.id });
    listed = await ward().photos.list({ productId: listing.id });
    expect(listed.map((p) => p.id)).toEqual([c.id, a.id]);
    expect(listed.filter((p) => p.isPrimary).map((p) => p.id)).toEqual([c.id]);
  });

  it('refuses a stale reorder rather than guessing', async () => {
    const listing = await newListing();
    const a = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));

    await expect(ward().photos.reorder({ productId: listing.id, photoIds: [a.id] }))
      .rejects.toThrow(/حدّث الصفحة/);
  });

  /** A complete draft, saved and submitted the way a house's is — never a direct UPDATE. */
  const submitForReview = async (productId: string) => {
    await ward().listings.save({
      id: productId,
      draft: {
        pricePiastres: 45000,
        volumeMl: 50,
        stock: 12,
        fulfilmentHours: 48,
        concentration: 'eau_de_parfum',
        form: 'spray',
        genderPositioning: 'unisex',
        scentFamily: 'oud',
        notesTop: ['برغموت'],
        notesHeart: ['ورد'],
        notesBase: ['عود'],
        seasons: ['winter'],
        dayNight: 'night',
        occasions: ['evening'],
        projectionBand: 'moderate',
        longevityBand: 'long',
        performanceSource: 'seller_provided',
        responsiblePartyName: 'دار الورد',
        returnEligibility: 'sealed_only',
        defectRoute: 'استبدال خلال 14 يومًا',
      },
    });
    const submitted = await ward().listings.submit({ id: productId });
    // Asserted, so the cases below cannot pass for the wrong reason.
    expect(submitted.submitted, `the listing did not reach review: ${JSON.stringify(submitted.gaps)}`).toBe(true);
    expect((await ward().listings.get({ id: productId })).state).toBe('pending_moderation');
  };

  it('a listing awaiting review refuses every photograph change — the screen and the API agree', async () => {
    /*
     * The first version of this case pushed an empty draft into review with a
     * direct UPDATE, which the publish gate refused, so the rule under test was
     * never reached. The listing now reaches review by the house's own path.
     */
    const listing = await newListing();
    const primary = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    await submitForReview(listing.id);

    const locked = /قيد المراجعة/;
    await expect(ward().photos.startUpload({
      productId: listing.id, contentType: 'image/jpeg', byteSize: 4_000,
    })).rejects.toThrow(locked);
    await expect(ward().photos.remove({ productId: listing.id, photoId: primary.id })).rejects.toThrow(locked);
    await expect(ward().photos.describe({
      productId: listing.id, photoId: primary.id, alt: 'وصف آخر', ownershipConfirmed: true,
    })).rejects.toThrow(locked);

    // Reading is still allowed — a house can look at what it submitted.
    expect((await ward().photos.list({ productId: listing.id })).map((p) => p.id)).toEqual([primary.id]);
  });

  it('a LIVE listing keeps its primary photograph, but may gain another', async () => {
    const listing = await newListing();
    const primary = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    await submitForReview(listing.id);

    // Published by the platform's own decision, as a moderator would.
    const [staff] = await db.select({ id: schema.platformStaff.id }).from(schema.platformStaff).limit(1);
    const platform = caller(
      { role: 'platform', id: PLATFORM }, null,
      { staffId: staff!.id, role: 'admin', label: 'مشغّلة المنصّة' },
    );
    await platform.listings.decide({ id: listing.id, to: 'published', reason: null });
    expect((await ward().listings.get({ id: listing.id })).state).toBe('published');

    await expect(ward().photos.remove({ productId: listing.id, photoId: primary.id }))
      .rejects.toThrow(/اختر صورة رئيسية أخرى/);

    // A better photograph should not require taking a product off sale.
    const second = await confirm(listing.id, await upload(listing.id, jpeg(2400, 3000)));
    await ward().photos.makePrimary({ productId: listing.id, photoId: second.id });
    await ward().photos.remove({ productId: listing.id, photoId: primary.id });
    expect((await ward().photos.list({ productId: listing.id })).map((p) => p.id)).toEqual([second.id]);
  });
});
