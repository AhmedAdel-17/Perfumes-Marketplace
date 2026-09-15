/**
 * Returns, support and applications — through the whole stack.
 *
 * A separate file from `api.test.ts` because these three share one fixture (an
 * order walked all the way to delivered) and that file's fixture is built for
 * cart and money assertions. Splitting them keeps each file's setup readable,
 * which is what stops a case passing for a reason nobody intended.
 *
 * Everything here is exercised through the routers a browser would reach.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, RETURN_STATES, VERIFICATION_CONTROLS } from '@diyar/domain';
import { DrizzleUnitOfWork, schema, type ActorContext, type DiyarDatabase } from '@diyar/db';
import { applyMigrations } from '@diyar/db/migrate';
import { appRouter } from './routers/index';
import type { ApiContext } from './trpc';
import { testMediaStore } from './testing/media';

const CLOCK = new FixedClock(new Date('2026-09-02T09:00:00Z'));
const MEDIA = testMediaStore();
const PLATFORM = '99999999-9999-9999-9999-999999999999';
const HOUSE_STAFF = '11111111-1111-1111-1111-111111111111';

let pg: PGlite;
let db: DiyarDatabase;
const ids: Record<string, string> = {};

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
    media: MEDIA,
    clock: CLOCK,
  };
  return appRouter.createCaller(ctx);
};

const ANON: ActorContext = { role: 'anon', id: null };
const PLATFORM_ACTOR: ActorContext = { role: 'platform', id: PLATFORM };
const OPERATOR = { staffId: '', role: 'admin', label: 'مشغّلة المنصّة' };

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;

  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const staff = await pg.query<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'مشغّلة المنصّة','01000000001','admin') RETURNING id`, [PLATFORM]);
  OPERATOR.staffId = staff.rows[0]!.id;

  const seller = await pg.query<{ id: string }>(
    `INSERT INTO sellers (trading_name,owner_name,contact_phone,slug,status)
     VALUES ('ميزون نور','مالك','01001234567','maison-nour','live') RETURNING id`);
  ids.seller = seller.rows[0]!.id;

  await pg.query(
    `INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name)
     VALUES ($1,$2,'owner','مالك')`, [ids.seller, HOUSE_STAFF]);

  const brand = await pg.query<{ id: string }>(
    `INSERT INTO brands (seller_id,name,slug) VALUES ($1,'ميزون نور','nour-b') RETURNING id`,
    [ids.seller]);

  // `sealed_only` so a change of mind is permitted; a fault is permitted
  // regardless, which is the rule the domain tests already prove.
  const product = await pg.query<{ id: string }>(
    `INSERT INTO products (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock,status,
       concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,
       seasons,occasions,day_night,projection_band,longevity_band,performance_source,
       responsible_party_name,return_eligibility,defect_route)
     VALUES ($1,$2,'ليل القاهرة','layl','NUR-50',45000,50,25,'draft',
       'eau_de_parfum','spray','women','amber',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['مسك'],
       ARRAY['spring']::season[],ARRAY['daily']::occasion[],'both','moderate','long','seller_provided',
       'ميزون نور','sealed_only','استلام') RETURNING id`,
    [ids.seller, brand.rows[0]!.id]);
  ids.product = product.rows[0]!.id;

  await pg.query(
    `INSERT INTO product_media (product_id,storage_path,alt_text,is_primary,ownership_confirmed)
     VALUES ($1,'p.jpg','زجاجة',true,true)`, [ids.product]);
  await pg.query(`UPDATE products SET status='published' WHERE id=$1`, [ids.product]);

  await pg.exec(`RESET app.actor_role; RESET app.actor_id;`);
}, 180_000);

afterAll(async () => { await pg?.close(); });

/** Place, confirm, dispatch and deliver — through the real routers. */
const deliveredOrder = async (phone: string) => {
  const anon = caller(ANON);
  const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
  const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

  const placed = await anon.orders.place({
    contactName: 'ليلى محمود حسن',
    contactPhone: phone,
    address: {
      governorate: 'cairo', city: 'الزمالك', area: 'الجزيرة',
      street: 'شارع 26 يوليو', building: '11',
    },
    lines: [{ productId: ids.product!, quantity: 1 }],
    paymentMethod: 'cod',
  });

  const row = (await house.seller.queue()).find((r) => r.reference.startsWith(placed.reference))!;
  await house.seller.confirm({ subOrderId: row.id });
  await house.seller.dispatch({ subOrderId: row.id, trackingNumber: `EG-${phone.slice(-6)}` });
  await ops.platform.markDelivered({ subOrderId: row.id });

  return { reference: placed.reference, phone };
};

/* ============================================================== returns */

describe('returns — asked by the customer, decided by everybody else', () => {
  it('offers only what the listing and the law permit', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01166660001');

    const [line] = await anon.returns.returnable(order);
    expect(line).toBeDefined();
    expect(line!.delivered).toBe(true);

    /*
     * `sealed_only` permits a change of mind, and a fault is permitted
     * whatever the listing says — Egypt's Consumer Protection Law 181/2018
     * gives a remedy no seller policy can waive.
     */
    expect(line!.reasons).toContain('changed_mind');
    expect(line!.reasons).toContain('defective');
    expect(line!.reasons).toContain('damaged_in_transit');
  });

  it('records a request with the cost bearer the REASON implies', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01166660002');
    const [line] = await anon.returns.returnable(order);

    await anon.returns.request({
      ...order,
      lineItemId: line!.lineItemId,
      reason: 'defective',
      note: 'البخّاخ لا يعمل من أول استخدام',
    });

    const [record] = await anon.returns.mine(order);
    expect(record).toBeDefined();
    // Doc 06 §7: cost allocation depends on the reason, so it is decided by
    // the rule rather than by whoever is annoyed later.
    expect(record!.costBearer).toBe('seller');
    expect(record!.state).toBe('requested');
  });

  it('refuses a return with no explanation', async () => {
    const anon = caller(ANON);
    const order = await deliveredOrder('01166660003');
    const [line] = await anon.returns.returnable(order);

    // The house has to pack, collect and inspect. A bare reason code tells it
    // nothing it can act on.
    await expect(anon.returns.request({
      ...order, lineItemId: line!.lineItemId, reason: 'defective', note: '   ',
    })).rejects.toThrow();
  });

  it('cannot be asked for on SOMEBODY ELSE’S parcel', async () => {
    const anon = caller(ANON);
    const mine = await deliveredOrder('01166660004');
    const theirs = await deliveredOrder('01166660005');
    const [theirLine] = await anon.returns.returnable(theirs);

    await expect(anon.returns.request({
      ...mine, lineItemId: theirLine!.lineItemId,
      reason: 'changed_mind', note: 'لم يعجبني',
    })).rejects.toThrow();

    expect(await anon.returns.mine(theirs)).toEqual([]);
  });

  it('REFUSES a refund on a bottle that has not come back', async () => {
    /*
     * The single sentence the return state machine exists to make true. There
     * is no path from `requested` or `approved` to `refunded`; money moves only
     * after somebody physically had the bottle. Refunding on a promise is how a
     * marketplace funds a fraud ring.
     */
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const order = await deliveredOrder('01166660006');
    const [line] = await anon.returns.returnable(order);
    await anon.returns.request({
      ...order, lineItemId: line!.lineItemId, reason: 'defective', note: 'عيب',
    });
    const [record] = await anon.returns.mine(order);

    await expect(ops.returns.resolve({
      id: record!.id, to: 'refunded', refundPiastres: 45_000,
    })).rejects.toThrow();

    // And every other state is refused too, from the top of the machine.
    for (const to of RETURN_STATES.filter((s) => !['approved', 'declined', 'closed'].includes(s))) {
      await expect(ops.returns.resolve({ id: record!.id, to })).rejects.toThrow();
    }
  });

  it('lets money move once the bottle is back, and records who moved it', async () => {
    const anon = caller(ANON);
    const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    const order = await deliveredOrder('01166660007');
    const [line] = await anon.returns.returnable(order);
    await anon.returns.request({
      ...order, lineItemId: line!.lineItemId, reason: 'defective', note: 'تسريب',
    });
    const [record] = await anon.returns.mine(order);

    await house.returns.decide({ id: record!.id, to: 'approved' });
    await house.returns.decide({ id: record!.id, to: 'in_transit' });
    await house.returns.decide({ id: record!.id, to: 'received' });

    // A house may take a bottle back. It may NOT refund: money is the
    // platform's to move, and a house that could mark a return refunded could
    // close a case without paying anybody.
    await expect(house.returns.decide({ id: record!.id, to: 'refunded' })).rejects.toThrow();

    await ops.returns.resolve({ id: record!.id, to: 'refunded', refundPiastres: 45_000 });

    const [after] = await anon.returns.mine(order);
    expect(after!.state).toBe('refunded');
    expect(after!.refundPiastres).toBe(45_000);

    const [entry] = await new DrizzleUnitOfWork(db, PLATFORM_ACTOR)
      .transaction((r) => r.audit.recent({ entityTable: 'returns', entityId: record!.id }));
    expect(entry, 'a refund wrote no audit entry').toBeDefined();
    expect(entry!.actorLabel).toBe('مشغّلة المنصّة');
  });

  it('refuses a refund with no amount', async () => {
    const anon = caller(ANON);
    const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    const order = await deliveredOrder('01166660008');
    const [line] = await anon.returns.returnable(order);
    await anon.returns.request({
      ...order, lineItemId: line!.lineItemId, reason: 'wrong_item', note: 'منتج مختلف',
    });
    const [record] = await anon.returns.mine(order);

    for (const to of ['approved', 'in_transit', 'received'] as const) {
      await house.returns.decide({ id: record!.id, to });
    }

    // A refund with no amount is a case closed with nothing paid, which is the
    // shape a dispute takes six weeks later.
    await expect(ops.returns.resolve({ id: record!.id, to: 'refunded' })).rejects.toThrow();
  });

  it('a house sees its own returns and cannot touch another’s', async () => {
    const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
    const queue = await house.returns.queue();
    expect(queue.length).toBeGreaterThan(0);

    // RLS restricts the read to this house's sub-orders, so a return belonging
    // to another house is simply not found rather than forbidden.
    await expect(house.returns.decide({
      id: '00000000-0000-4000-8000-000000000000', to: 'approved',
    })).rejects.toThrow();
  });
});

/* ============================================================== support */

describe('support — anybody may ask, and the answer comes back', () => {
  it('opens a ticket with NO order number', async () => {
    // Somebody deciding whether to buy is exactly who this exists for, and a
    // required order number turns a pre-sale question into a lost sale.
    const created = await caller(ANON).support.open({
      category: 'product_question',
      subject: 'هل تشحنون لأسوان؟',
      message: 'أفكّر في الطلب لكن لم أجد أسوان في القائمة.',
      contactName: 'سلمى أحمد',
      contactPhone: '01177770001',
      orderReference: null,
    });

    expect(created.reference).toMatch(/^DS-[CDFHJKMNPQRVWXY349]{8}$/);
  });

  it('derives the priority, and never lets a form reach p0', async () => {
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    await anon.support.open({
      category: 'damaged_or_wrong',
      subject: 'وصلت مكسورة',
      message: 'الزجاجة وصلت مكسورة داخل العلبة.',
      contactName: 'ياسمين',
      contactPhone: '01177770002',
      orderReference: null,
    });

    const queue = await ops.support.queue();
    const urgent = queue.find((t) => t.contactPhone === '01177770002')!;
    expect(urgent.priority).toBe('p1');
    // p0 is an incident the platform declares. A queue whose top severity can
    // be set from a public form is a queue that fills with it.
    expect(queue.every((t) => t.priority !== 'p0')).toBe(true);
  });

  it('RESOLVES the order link rather than trusting it', async () => {
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const order = await deliveredOrder('01177770003');

    // The right reference on the right phone links.
    await anon.support.open({
      category: 'order_status',
      subject: 'أين طلبي؟',
      message: 'مرّ أسبوع ولم يصلني شيء.',
      contactName: 'ليلى',
      contactPhone: order.phone,
      orderReference: order.reference,
    });

    // The SAME reference, quoted by somebody else. It must not attach their
    // ticket to an order that is not theirs.
    await anon.support.open({
      category: 'order_status',
      subject: 'سؤال',
      message: 'أريد معرفة حالة الطلب.',
      contactName: 'شخص آخر',
      contactPhone: '01177779999',
      orderReference: order.reference,
    });

    const queue = await ops.support.queue();
    expect(queue.find((t) => t.contactPhone === order.phone)!.orderReference)
      .toBe(order.reference);
    expect(queue.find((t) => t.contactPhone === '01177779999')!.orderReference)
      .toBeNull();
  });

  it('is read back with the reference AND the phone', async () => {
    const anon = caller(ANON);
    const created = await anon.support.open({
      category: 'other',
      subject: 'استفسار',
      message: 'سؤال عام عن التغليف.',
      contactName: 'نادر',
      contactPhone: '01177770004',
      orderReference: null,
    });

    expect(await anon.support.byReference({
      reference: created.reference, phone: '01177770004',
    })).not.toBeNull();

    // A wrong phone returns the same null an unknown reference does.
    expect(await anon.support.byReference({
      reference: created.reference, phone: '01177778888',
    })).toBeNull();
  });

  it('what an operator writes is what the customer reads', async () => {
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    const created = await anon.support.open({
      category: 'return_or_refund',
      subject: 'استرداد',
      message: 'متى يصل المبلغ؟',
      contactName: 'هدى',
      contactPhone: '01177770005',
      orderReference: null,
    });

    const row = (await ops.support.queue()).find((t) => t.reference === created.reference)!;
    // Not yet answered — the number that actually matters on a support queue.
    expect(row.firstResponseAt).toBeNull();

    await ops.support.update({
      id: row.id, status: 'waiting', nextAction: 'حوّلنا المبلغ اليوم ويصل خلال ٣ أيام عمل.',
    });

    const seen = await anon.support.byReference({
      reference: created.reference, phone: '01177770005',
    });
    expect(seen!.nextAction).toBe('حوّلنا المبلغ اليوم ويصل خلال ٣ أيام عمل.');
    expect(seen!.status).toBe('waiting');
  });

  it('stamps the first response ONCE', async () => {
    const anon = caller(ANON);
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);

    const created = await anon.support.open({
      category: 'payment',
      subject: 'الدفع',
      message: 'هل يمكن الدفع بالبطاقة؟',
      contactName: 'كريم',
      contactPhone: '01177770006',
      orderReference: null,
    });
    const row = (await ops.support.queue()).find((t) => t.reference === created.reference)!;

    await ops.support.update({ id: row.id, status: 'waiting', nextAction: 'أول ردّ' });
    const first = (await ops.support.queue({ includeClosed: true }))
      .find((t) => t.reference === created.reference)!.firstResponseAt;

    await ops.support.update({ id: row.id, status: 'resolved', nextAction: 'ردّ ثانٍ' });
    const second = (await ops.support.queue({ includeClosed: true }))
      .find((t) => t.reference === created.reference)!.firstResponseAt;

    /*
     * The number that says how long somebody waited to hear from a human. A
     * field overwritten on every update measures the last touch instead, which
     * is a metric that always looks excellent.
     */
    expect(second).toBe(first);
  });

  it('a HOUSE cannot read the support queue', async () => {
    const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
    await expect(house.support.queue()).rejects.toThrow();
  });
});

/* ========================================================= applications */

describe('applications — a house joins, and cannot let itself in', () => {
  const application = (overrides: Record<string, unknown> = {}) => ({
    tradingName: 'أتيليه سيوة',
    latinName: 'Atelier Siwa',
    ownerName: 'سلمى عبد الله',
    contactPhone: '01188880001',
    contactEmail: null,
    city: 'سيوة',
    note: 'دار صغيرة في سيوة نصنع بالزيوت المحلية منذ ٢٠٢١ ونعبّئ بأنفسنا، نحو مئة زجاجة شهريًا.',
    ...overrides,
  });

  it('records an application, and derives the storefront address', async () => {
    const created = await caller(ANON).applications.submit(application());
    expect(created.slug).toBe('atelier-siwa');
  });

  it('cannot create a LIVE house, whatever it sends', async () => {
    /*
     * The guarantee migration 0018 exists for. `intake` may insert a seller
     * with `status = 'applied'` and nothing else — the restriction is in the
     * policy's WITH CHECK, so it holds even if this router were wrong.
     */
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const queue = await ops.applications.queue();
    const applied = queue.find((a) => a.slug === 'atelier-siwa')!;
    expect(applied.status).toBe('applied');
    expect(applied.approvedControls).toBe(0);
    expect(applied.totalControls).toBe(VERIFICATION_CONTROLS.length);
  });

  it('refuses the Arabic name typed into the Latin box', async () => {
    // The commonest way this form goes wrong, and the consequence is silent:
    // every non-Latin character is stripped and the house lands at `/house/`.
    await expect(caller(ANON).applications.submit(application({
      latinName: 'أتيليه سيوة', contactPhone: '01188880002',
    }))).rejects.toThrow();
  });

  it('refuses a storefront address already taken', async () => {
    await expect(caller(ANON).applications.submit(application({
      contactPhone: '01188880003',
    }))).rejects.toThrow();
  });

  it('REFUSES to make a house live before the eight controls pass', async () => {
    /*
     * Not this router's guarantee. Migration 0001's trigger refuses the
     * transition unless every control has passed, so the rule holds even if the
     * console offered the button — which it does, deliberately, so an operator
     * learns the rule from a message naming the missing controls.
     */
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const applied = (await ops.applications.queue()).find((a) => a.slug === 'atelier-siwa')!;

    await expect(ops.applications.setStatus({ id: applied.id, status: 'live' }))
      .rejects.toThrow();

    const still = (await ops.applications.queue()).find((a) => a.slug === 'atelier-siwa')!;
    expect(still.status).not.toBe('live');
  });

  it('goes live once every control passes, and each one is audited', async () => {
    const ops = caller(PLATFORM_ACTOR, null, OPERATOR);
    const applied = (await ops.applications.queue()).find((a) => a.slug === 'atelier-siwa')!;

    for (const control of VERIFICATION_CONTROLS) {
      await ops.applications.verify({
        sellerId: applied.id, control, status: 'approved', notes: null,
      });
    }

    const detail = await ops.applications.detail({ id: applied.id });
    expect(detail!.approvedControls).toBe(VERIFICATION_CONTROLS.length);

    await ops.applications.setStatus({ id: applied.id, status: 'live' });

    // Gone from the intake queue, because it is trading now.
    expect((await ops.applications.queue()).some((a) => a.slug === 'atelier-siwa')).toBe(false);

    /*
     * And it is now visible to an ANONYMOUS visitor, which is the point.
     *
     * Read through the public router rather than as the platform, because the
     * RLS policy that admits it is `status = 'live'` — a check performed as an
     * operator would pass whatever the status said.
     */
    const public_ = await caller(ANON).catalogue.houseBySlug({ slug: 'atelier-siwa' });
    expect(public_, 'a live house must be readable by a visitor').not.toBeNull();

    const trail = await new DrizzleUnitOfWork(db, PLATFORM_ACTOR)
      .transaction((r) => r.audit.recent({ entityTable: 'sellers', entityId: applied.id }));
    expect(trail.length, 'going live wrote no audit entry').toBeGreaterThan(0);
    expect(trail[0]!.action).toBe('seller_status_change');
  });

  it('a HOUSE cannot read the intake queue or verify itself', async () => {
    const house = caller({ role: 'seller', id: HOUSE_STAFF }, ids.seller);
    await expect(house.applications.queue()).rejects.toThrow();
    await expect(house.applications.verify({
      sellerId: ids.seller!, control: 'owner_identity', status: 'approved', notes: null,
    })).rejects.toThrow();
  });
});
