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

const caller = (actor: ActorContext, sellerId: string | null = null) => {
  const ctx: ApiContext = {
    actor,
    sellerId,
    uow: new DrizzleUnitOfWork(db, actor),
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

beforeAll(async () => {
  pg = new PGlite();
  for (const f of ['0000_initial.sql', '0001_constraints.sql', '0002_rls.sql']) {
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
      `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,status,
         concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,
         seasons,occasions,day_night,projection_band,longevity_band,performance_source,
         responsible_party_name,return_eligibility,defect_route)
       VALUES ($1,$2,'عطر',$3,$4,38000,50,'draft',
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
      `INSERT INTO sub_orders (order_id,seller_id,reference,merchandise_piastres,shipping_piastres,state)
       VALUES ($1,$2,$3,38000,5000,'awaiting_seller') RETURNING id`,
      [o.rows[0]!.id, ids[slug], 'DY-' + slug + '-A']);
    ids[slug + ':sub'] = so.rows[0]!.id;
  }

  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
}, 180_000);

afterAll(async () => { await pg?.close(); });

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

  it('a house sees ONLY its own queue', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const rows = await ward.seller.queue();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reference).toBe('DY-dar-al-ward-A');
  });

  it('and the other house sees only its own', async () => {
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const rows = await nour.seller.queue();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reference).toBe('DY-maison-nour-A');
  });

  it("a house cannot confirm a competitor's sub-order, even naming its id", async () => {
    // The crafted request names Nour's sub-order while authenticated as Ward.
    // RLS makes it invisible, so the router reports not-found rather than acting.
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const result = await ward.seller.confirm({ subOrderId: ids['maison-nour:sub']! });
    expect(result.ok).toBe(false);

    // and Nour's order is untouched
    const nour = caller({ role: 'seller', id: NOUR_STAFF }, ids['maison-nour']);
    const rows = await nour.seller.queue();
    expect(rows[0]!.state).toBe('awaiting_seller');
  });
});

describe('the queue actually works for its owner', () => {
  it('confirms an order', async () => {
    const ward = caller({ role: 'seller', id: WARD_STAFF }, ids['dar-al-ward']);
    const r = await ward.seller.confirm({ subOrderId: ids['dar-al-ward:sub']! });
    expect(r).toEqual({ ok: true, state: 'confirmed' });

    const rows = await ward.seller.queue();
    expect(rows[0]!.state).toBe('confirmed');
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
