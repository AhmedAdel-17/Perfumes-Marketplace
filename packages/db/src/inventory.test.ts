/** Inventory guarantees through the real adapter, transactional triggers and RLS.
 * Every database here is disposable; no existing local or remote data is opened. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Address, FixedClock, Money, PlaceOrder, SubOrderLifecycle,
  type Actor, type ReasonCode, type SubOrderState } from '@diyar/domain';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type ActorContext, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const PLATFORM = '99999999-9999-9999-9999-999999999999';
const at = new Date('2026-11-07T10:00:00Z');
const clock = new FixedClock(at);
const egp = (value: string) => Money.fromMajorString(value);
let pg: PGlite;
let db: DiyarDatabase;
let sellerId: string;
let brandId: string;
let otherSellerId: string;
let otherBrandId: string;
let customerId: string;
let sequence = 0;
const uow = (actor: ActorContext) => new DrizzleUnitOfWork(db, actor);
const owner = () => uow({ role: 'seller', id: OWNER });
const platform = () => uow({ role: 'platform', id: PLATFORM });
const checkout = () => uow({ role: 'checkout', id: null });

beforeAll(async () => {
  pg = new PGlite(); await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  await pg.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);
  await pg.query(`INSERT INTO platform_staff (auth_user_id,full_name,phone,role) VALUES ($1,'Operator','01000000001','admin')`, [PLATFORM]);
  for (const [slug, staff] of [['inventory-a', OWNER], ['inventory-b', OTHER]] as const) {
    const seller = await pg.query<{ id: string }>(`INSERT INTO sellers (trading_name,owner_name,slug,status) VALUES ($1,'Owner',$1,'live') RETURNING id`, [slug]);
    const id = seller.rows[0]!.id;
    await pg.query(`INSERT INTO seller_staff (seller_id,auth_user_id,role,full_name) VALUES ($1,$2,'owner','Owner')`, [id, staff]);
    const brand = await pg.query<{ id: string }>(`INSERT INTO brands (seller_id,name,slug) VALUES ($1,$2,$2) RETURNING id`, [id, slug]);
    if (staff === OWNER) { sellerId = id; brandId = brand.rows[0]!.id; }
    else { otherSellerId = id; otherBrandId = brand.rows[0]!.id; }
  }
  const customer = await pg.query<{ id: string }>(`INSERT INTO customers (phone,full_name) VALUES ('01009998877','Customer') RETURNING id`);
  customerId = customer.rows[0]!.id;
}, 180_000);
afterAll(async () => { await pg?.close(); });

const product = async (stock = 5, other = false) => {
  sequence += 1;
  const rows = await pg.query<{ id: string }>(`INSERT INTO products
    (seller_id,brand_id,name,slug,sku,price_piastres,volume_ml,stock,status,
     concentration,form,gender_positioning,scent_family,notes_top,notes_heart,notes_base,seasons,occasions,day_night,
     projection_band,longevity_band,performance_source,responsible_party_name,return_eligibility,defect_route)
    VALUES ($1,$2,'Inventory perfume',$3,$3,10000,50,$4,'draft',
     'eau_de_parfum','spray','unisex','amber',ARRAY['برغموت'],ARRAY['ورد'],ARRAY['مسك'],
     ARRAY['spring']::season[],ARRAY['daily']::occasion[],'both','moderate','long','seller_provided','House','sealed_only','Contact seller') RETURNING id`,
  [other ? otherSellerId : sellerId, other ? otherBrandId : brandId, `inventory-${sequence}`, stock]);
  const id = rows.rows[0]!.id;
  await pg.query(`INSERT INTO product_media(product_id,storage_path,alt_text,is_primary,ownership_confirmed,content_type,byte_size,width,height)
    VALUES ($1,$2,'Bottle',true,true,'image/jpeg',1000,1000,1250)`, [id, `products/${id}/${'a'.repeat(24)}.jpg`]);
  await pg.query(`UPDATE products SET status='published' WHERE id=$1`, [id]);
  return id;
};
const draft = (productId: string, quantity = 2) => new PlaceOrder(clock).build({
  reference: `DY-INVENTORY-${++sequence}`, customerId, contactPhone: '01009998877', contactName: 'Customer',
  address: Address.create({ governorate: 'cairo', city: 'Cairo', area: 'Nasr', street: 'Street', building: '1' }),
  lines: [{ productId, sellerId: 'inventory-a', productName: 'Perfume', brandName: 'House', sku: 'I-1', volumeMl: 50, quantity, unitPrice: egp('100') }],
  shipping: [{ sellerId: 'inventory-a', amount: egp('20'), etaDaysMin: 2, etaDaysMax: 4 }],
  terms: [{ sellerId: 'inventory-a', confirmationSlaHours: 24, dispatchSlaHours: 48 }],
  paymentMethod: 'cod', touches: [], priorPurchaseSellerIds: new Set(), orderedAt: at,
});
const place = (productId: string, quantity = 2) => checkout().transaction(r => r.orders.save(draft(productId, quantity), new Map([['inventory-a', sellerId]])));
const summary = (id: string) => owner().transaction(r => r.inventory.summary(id));
const transition = (id: string, to: SubOrderState, actor: Actor, reason: ReasonCode | null = null) =>
  (actor === 'seller' ? owner() : platform()).transaction(async r => {
    const current = await r.subOrders.findById(id);
    const record = SubOrderLifecycle.transition(current!.state, { to, actor, ...(reason ? { reason } : {}) }, clock);
    await r.subOrders.applyTransition(id, to, actor, reason, record);
  });
const assertCounter = async (id: string) => {
  const result = await pg.query<{ cached: number; actual: number }>(`SELECT p.reserved_stock AS cached,
    coalesce((SELECT sum(quantity)::int FROM inventory_reservations WHERE product_id=p.id AND state='active'),0) AS actual FROM products p WHERE p.id=$1`, [id]);
  expect(result.rows[0]?.cached).toBe(result.rows[0]?.actual);
};
const rawAsOwner = (query: string, params: unknown[] = []) => pg.transaction(async tx => {
  await tx.query(`SELECT set_config('app.actor_role','seller',true),set_config('app.actor_id',$1,true)`, [OWNER]);
  await tx.exec('SET LOCAL ROLE app_user');
  return tx.query(query, params);
});

describe('inventory — SQL invariants and tenant isolation', () => {
  it('rejects stale absolute listing stock after dispatch without changing accompanying metadata', async () => {
    const id = await product(); const placed = await place(id); const sub = placed.subOrderIds[0]!;
    await transition(sub, 'awaiting_seller', 'system'); await transition(sub, 'confirmed', 'seller'); await transition(sub, 'dispatched', 'seller');
    expect(await summary(id)).toMatchObject({ onHand: 3 });
    await expect(owner().transaction(r => r.listings.update(id, sellerId, { name: 'Stale update', stock: 5 }, 5))).rejects.toMatchObject({ code: 'LISTING_STOCK_CONFLICT' });
    await expect(owner().transaction(r => r.listings.update(id, sellerId, { stock: 5 }))).rejects.toMatchObject({ code: 'LISTING_STOCK_CONFLICT' });
    expect(await owner().transaction(r => r.listings.findForSeller(id, sellerId))).toMatchObject({ name: 'Inventory perfume', stock: 3 });
    await owner().transaction(r => r.listings.update(id, sellerId, { name: 'Metadata only', stock: 3 }));
    await owner().transaction(r => r.listings.update(id, sellerId, { stock: 4 }, 3));
    expect(await summary(id)).toMatchObject({ onHand: 4, reserved: 0, available: 4 });
  });

  it('reserves availability atomically, exposes the true counter and refuses overselling without partial orders', async () => {
    const id = await product(3);
    await place(id);
    expect(await summary(id)).toEqual({ productId: id, onHand: 3, reserved: 2, available: 1 });
    expect((await checkout().transaction(r => r.products.snapshotForCart([id])))[0]?.stock).toBe(1);
    await assertCounter(id);
    const failed = draft(id);
    await expect(checkout().transaction(r => r.orders.save(failed, new Map([['inventory-a', sellerId]])))).rejects.toThrow();
    expect(await platform().transaction(r => r.orders.findByReference(failed.reference))).toBeNull();
    expect(await summary(id)).toMatchObject({ onHand: 3, reserved: 2, available: 1 });
    const movements = await owner().transaction(r => r.inventory.movements(id, 100));
    expect(movements.filter(row => row.kind === 'reserve')).toHaveLength(1);
  });

  it('rolls back reservations, cached quantities and journal entries together', async () => {
    const id = await product();
    const failed = draft(id);
    await expect(checkout().transaction(async r => { await r.orders.save(failed, new Map([['inventory-a', sellerId]])); throw new Error('Rollback'); })).rejects.toThrow('Rollback');
    expect(await summary(id)).toMatchObject({ onHand: 5, reserved: 0, available: 5 });
    expect(await platform().transaction(r => r.orders.findByReference(failed.reference))).toBeNull();
    expect((await owner().transaction(r => r.inventory.movements(id, 100))).map(row => row.kind)).toEqual(['opening']);
    await assertCounter(id);
  });

  it('releases rejected and cancelled holds without reducing physical stock', async () => {
    for (const terminal of ['rejected', 'cancelled'] as const) {
      const id = await product(); const order = await place(id); const sub = order.subOrderIds[0]!;
      await transition(sub, 'awaiting_seller', 'system');
      if (terminal === 'cancelled') await transition(sub, 'confirmed', 'seller');
      await transition(sub, terminal, terminal === 'rejected' ? 'seller' : 'customer', terminal === 'rejected' ? 'out_of_stock' : 'customer_request');
      expect(await summary(id)).toMatchObject({ onHand: 5, reserved: 0, available: 5 });
      const rows = await owner().transaction(r => r.inventory.movements(id, 100));
      expect(rows.filter(row => row.kind === 'release')).toHaveLength(1);
      await assertCounter(id);
    }
  });

  it('consumes on dispatch once and never automatically restocks a refused or returned parcel', async () => {
    for (const terminal of ['refused', 'returned'] as const) {
      const id = await product(); const order = await place(id); const sub = order.subOrderIds[0]!;
      await transition(sub, 'awaiting_seller', 'system'); await transition(sub, 'confirmed', 'seller'); await transition(sub, 'dispatched', 'seller');
      expect(await summary(id)).toMatchObject({ onHand: 3, reserved: 0, available: 3 });
      await expect(transition(sub, 'dispatched', 'seller')).rejects.toThrow();
      if (terminal === 'returned') await transition(sub, 'delivered', 'platform');
      await transition(sub, terminal, 'platform', terminal === 'refused' ? 'customer_refused' : 'defective');
      expect(await summary(id)).toMatchObject({ onHand: 3, reserved: 0, available: 3 });
      const rows = await owner().transaction(r => r.inventory.movements(id, 100));
      expect(rows.filter(row => row.kind === 'dispatch')).toHaveLength(1);
      await assertCounter(id);
    }
  });

  it('removes fully reserved products from the public in-stock filter', async () => {
    const id=await product(2);
    const criteria={terms:[],families:[],houses:[],minEgp:null,maxEgp:null,inStockOnly:true,sort:'newest' as const};
    const anon=()=>uow({role:'anon',id:null}).transaction(r=>r.catalogue.search(criteria));
    expect((await anon()).some(p=>p.id===id)).toBe(true);
    await place(id,2);
    expect((await anon()).some(p=>p.id===id)).toBe(false);
    expect(await summary(id)).toMatchObject({onHand:2,reserved:2,available:0});
  });

  it('applies explicit corrections with CAS and safe replay, preserving the supplied timestamp', async () => {
    const id = await product();
    const command = { productId: id, expectedOnHand: 5, delta: 3, reason: 'restock' as const, requestId: randomUUID(), occurredAt: at };
    expect(await owner().transaction(r => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 8 } });
    expect(await owner().transaction(r => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 8 } });
    expect(await owner().transaction(r => r.inventory.adjust({ ...command, delta: 4 }))).toEqual({ ok: false, reason: 'conflict' });
    expect(await owner().transaction(r => r.inventory.adjust({ ...command, requestId: randomUUID() }))).toEqual({ ok: false, reason: 'conflict' });
    const journal = await owner().transaction(r => r.inventory.movements(id, 100));
    const corrections = journal.filter(row => row.reason === 'restock');
    expect(corrections).toHaveLength(1); expect(corrections[0]?.occurredAt.toISOString()).toBe(at.toISOString());
    expect(await owner().transaction(r => r.inventory.adjust({ ...command, expectedOnHand: 8, delta: -1, requestId: randomUUID() }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses corrections below held units and rolls back correction request IDs on failure', async () => {
    const id = await product(); await place(id, 4);
    const correction = { productId: id, expectedOnHand: 5, delta: -2, reason: 'damage' as const, requestId: randomUUID(), occurredAt: at };
    expect(await owner().transaction(r => r.inventory.adjust(correction))).toEqual({ ok: false, reason: 'insufficient_stock' });
    const command = { ...correction, delta: 1, reason: 'restock' as const };
    await expect(owner().transaction(async r => { await r.inventory.adjust(command); throw new Error('Rollback'); })).rejects.toThrow('Rollback');
    expect(await summary(id)).toMatchObject({ onHand: 5, reserved: 4, available: 1 });
    expect(await owner().transaction(r => r.inventory.adjust(command))).toMatchObject({ ok: true, stock: { onHand: 6, reserved: 4 } });
    expect((await owner().transaction(r => r.inventory.movements(id, 100))).filter(row => row.reason === 'restock')).toHaveLength(1);
  });

  it('does not expose or alter another seller’s stock or inventory journal', async () => {
    const own = await product(); const other = await product(8, true);
    expect(await summary(own)).not.toBeNull(); expect(await summary(other)).toBeNull();
    expect(await owner().transaction(r => r.inventory.movements(other, 10))).toEqual([]);
    expect(await owner().transaction(r => r.inventory.adjust({ productId: other, expectedOnHand: 8, delta: 1, reason: 'restock', requestId: randomUUID(), occurredAt: at }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await uow({ role: 'seller', id: OTHER }).transaction(r => r.inventory.summary(other))).toMatchObject({ onHand: 8 });
  });

  it('blocks raw reserved-counter tampering, journal writes, private hold edits and helper execution', async () => {
    const id = await product(); const order = await place(id);
    await expect(rawAsOwner('UPDATE products SET reserved_stock=0 WHERE id=$1', [id])).rejects.toThrow();
    await expect(rawAsOwner('UPDATE products SET stock=1 WHERE id=$1', [id])).rejects.toThrow();
    await expect(rawAsOwner(`INSERT INTO inventory_movements(product_id,seller_id,kind,delta_on_hand,delta_reserved,reason) VALUES ($1,$2,'adjust',1,0,'restock')`, [id, sellerId])).rejects.toThrow();
    expect((await rawAsOwner('UPDATE inventory_reservations SET state=\'released\',closed_at=now() WHERE product_id=$1 RETURNING id', [id])).rows).toEqual([]);
    const lines = await pg.query<{ id: string }>('SELECT id FROM order_line_items WHERE sub_order_id=$1', [order.subOrderIds[0]!]);
    await expect(rawAsOwner('SELECT app.inventory_hold_line($1::uuid)', [lines.rows[0]!.id])).rejects.toThrow();
    await expect(pg.query('UPDATE order_line_items SET quantity=1 WHERE id=$1', [lines.rows[0]!.id])).rejects.toThrow();
    const entries = await owner().transaction(r => r.inventory.movements(id, 10));
    await expect(pg.query('DELETE FROM inventory_movements WHERE id=$1', [entries[0]!.id])).rejects.toThrow();
    expect(await summary(id)).toMatchObject({ onHand: 5, reserved: 2, available: 3 }); await assertCounter(id);
  });
});

