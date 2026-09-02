/**
 * Drizzle adapter for the domain's repository ports.
 *
 * Pattern — Ports & Adapters (ENGINEERING_PRINCIPLES §4).
 *
 * The domain declares what it needs; this is one way of providing it. The
 * in-memory adapter in `@diyar/domain/testing` is another, and both run the
 * identical contract — see `repositories.contract.test.ts`.
 *
 * Typed against Drizzle's driver-agnostic `PgDatabase`, so the same code serves
 * PGlite in tests and postgres-js in production. Nothing here is driver-specific.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  Money, SubOrderLifecycle, InvalidTransition,
  type Actor, type OrderSource, type ReasonCode, type SettlementSubOrder,
  type SubOrderState, type TransitionRecord,
  type DraftOrder, type OrderRepository, type PersistedOrder, type ProductRecord,
  type ProductRepository, type Repositories, type SellerRecord, type SellerRepository,
  type SubOrderRecord, type SubOrderRepository, type UnitOfWork,
} from '@diyar/domain';
import * as schema from './schema/index';

export type DiyarDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Any handle that can run queries — the root db or an open transaction. */
type Executor = DiyarDatabase;

// ------------------------------------------------------------------ mappers

const toSeller = (r: typeof schema.sellers.$inferSelect): SellerRecord => ({
  id: r.id,
  slug: r.slug,
  tradingName: r.tradingName,
  status: r.status,
  confirmationSlaHours: r.confirmationSlaHours,
  dispatchSlaHours: r.dispatchSlaHours,
  payoutReserveDays: r.payoutReserveDays,
  disputeWindowDays: r.disputeWindowDays,
});

const toProduct = (r: typeof schema.products.$inferSelect): ProductRecord => ({
  id: r.id,
  sellerId: r.sellerId,
  slug: r.slug,
  name: r.name,
  sku: r.sku,
  // Money crosses the boundary as Money. A bare number would let a caller do
  // float arithmetic on it, which is the whole reason the value object exists.
  price: Money.fromMinor(r.pricePiastres),
  volumeMl: r.volumeMl,
  stock: r.stock,
  status: r.status,
});

const toSubOrder = (r: typeof schema.subOrders.$inferSelect): SubOrderRecord => ({
  id: r.id,
  reference: r.reference,
  sellerId: r.sellerId,
  orderId: r.orderId,
  state: r.state,
  merchandise: Money.fromMinor(r.merchandisePiastres),
  shipping: Money.fromMinor(r.shippingPiastres),
});

// ------------------------------------------------------------- repositories

const sellerRepository = (db: Executor): SellerRepository => ({
  async findById(id) {
    const [row] = await db.select().from(schema.sellers).where(eq(schema.sellers.id, id)).limit(1);
    return row ? toSeller(row) : null;
  },
  async findBySlug(slug) {
    const [row] = await db.select().from(schema.sellers).where(eq(schema.sellers.slug, slug)).limit(1);
    return row ? toSeller(row) : null;
  },
});

const productRepository = (db: Executor): ProductRepository => ({
  async findBySlug(slug) {
    const [row] = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
    return row ? toProduct(row) : null;
  },
  async listPublishedBySeller(sellerId) {
    const rows = await db.select().from(schema.products).where(
      and(eq(schema.products.sellerId, sellerId), eq(schema.products.status, 'published')),
    );
    return rows.map(toProduct);
  },
});

const orderRepository = (db: Executor): OrderRepository => ({
  async save(draft: DraftOrder, sellerIdBySlug) {
    const a = draft.address;

    const [order] = await db.insert(schema.orders).values({
      reference: draft.reference,
      customerId: draft.customerId,
      contactPhone: draft.contactPhone,
      contactName: draft.contactName,
      governorate: a.governorate,
      city: a.city,
      area: a.area,
      street: a.street,
      building: a.building,
      floor: a.floor ?? null,
      apartment: a.apartment ?? null,
      landmark: a.landmark ?? null,
      source: draft.source,
      merchandisePiastres: draft.merchandise.minor,
      shippingPiastres: draft.shipping.minor,
      discountPiastres: draft.discount.minor,
      totalPiastres: draft.total.minor,
      paymentMethod: draft.paymentMethod,
      placedAt: draft.placedAt,
    }).returning({ id: schema.orders.id });

    const orderId = order!.id;
    const subOrderIds: string[] = [];

    for (const sub of draft.subOrders) {
      const sellerId = sellerIdBySlug.get(sub.sellerId);
      if (!sellerId) throw new Error(`No seller id for slug "${sub.sellerId}"`);

      const [row] = await db.insert(schema.subOrders).values({
        orderId,
        sellerId,
        reference: sub.reference,
        merchandisePiastres: sub.merchandise.minor,
        shippingPiastres: sub.shipping.minor,
        confirmDueAt: sub.confirmDueAt,
      }).returning({ id: schema.subOrders.id });

      subOrderIds.push(row!.id);

      for (const li of sub.lineItems) {
        await db.insert(schema.orderLineItems).values({
          subOrderId: row!.id,
          productId: li.productId,
          productName: li.productName,
          brandName: li.brandName,
          sku: li.sku,
          volumeMl: li.volumeMl,
          quantity: li.quantity,
          unitPricePiastres: li.unitPrice.minor,
          linePiastres: li.line.minor,
          commissionSource: li.commission.source,
          commissionBps: li.commission.bps,
          commissionRuleSetVersion: li.commission.ruleSetVersion,
          commissionPiastres: li.commissionAmount.minor,
        });
      }
    }

    return {
      id: orderId,
      reference: draft.reference,
      source: draft.source,
      total: draft.total,
      subOrderIds,
    };
  },

  async findByReference(reference) {
    const [row] = await db.select().from(schema.orders)
      .where(eq(schema.orders.reference, reference)).limit(1);
    if (!row) return null;

    const subs = await db.select({ id: schema.subOrders.id })
      .from(schema.subOrders).where(eq(schema.subOrders.orderId, row.id));

    return {
      id: row.id,
      reference: row.reference,
      source: row.source as OrderSource,
      total: Money.fromMinor(row.totalPiastres),
      subOrderIds: subs.map((s) => s.id),
    };
  },
});

const subOrderRepository = (db: Executor): SubOrderRepository => ({
  async findById(id) {
    const [row] = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.id, id)).limit(1);
    return row ? toSubOrder(row) : null;
  },

  async listBySeller(sellerId) {
    const rows = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));
    return rows.map(toSubOrder);
  },

  async applyTransition(
    id: string,
    to: SubOrderState,
    actor: Actor,
    reason: ReasonCode | null,
    record: TransitionRecord,
  ) {
    const [current] = await db.select({ state: schema.subOrders.state })
      .from(schema.subOrders).where(eq(schema.subOrders.id, id)).limit(1);
    if (!current) throw new Error(`Unknown sub-order ${id}`);

    // The adapter enforces the table too. A caller passing a hand-built record
    // must not be able to write a state the machine forbids — the database
    // trigger is a third line of defence, not the only one.
    if (!SubOrderLifecycle.rule(current.state, to)) {
      throw new InvalidTransition(current.state, to);
    }

    await db.update(schema.subOrders)
      .set({
        state: to,
        ...(to === 'confirmed' ? { confirmedAt: record.at } : {}),
        ...(to === 'dispatched' ? { dispatchedAt: record.at } : {}),
        ...(to === 'delivered' ? { deliveredAt: record.at } : {}),
      })
      .where(eq(schema.subOrders.id, id));

    await db.insert(schema.subOrderTransitions).values({
      subOrderId: id,
      fromState: current.state,
      toState: to,
      actor,
      reason,
      occurredAt: record.at,
    });
  },

  async listForSettlement(sellerId) {
    // Two plain queries stitched in memory, rather than correlated subqueries.
    // The first attempt inlined `SELECT commission_bps ... WHERE sub_order_id =`
    // into the select list; the correlation did not resolve and every rate came
    // back null, which the contract caught as "the snapshotted rate must be
    // carried through". Two readable queries beat one clever one on a money path.
    const subs = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));
    if (subs.length === 0) return [];

    const ids = subs.map((s) => s.id);

    const lines = await db
      .select({
        subOrderId: schema.orderLineItems.subOrderId,
        source: schema.orderLineItems.commissionSource,
        bps: schema.orderLineItems.commissionBps,
      })
      .from(schema.orderLineItems)
      .where(inArray(schema.orderLineItems.subOrderId, ids));

    // PlaceOrder assigns ONE snapshot per sub-order, so any line carries it.
    const snapshotBySub = new Map(lines.map((l) => [l.subOrderId, l]));

    // Cash in hand means the courier has actually remitted (COD) — not merely
    // that the parcel was delivered. Doc 03 §10: never pay a house faster than
    // we have been paid. Inferring this from delivered_at would pay out money
    // we do not yet hold.
    const shipments = await db
      .select({
        subOrderId: schema.shipments.subOrderId,
        remittedAt: schema.shipments.codRemittedAt,
      })
      .from(schema.shipments)
      .where(inArray(schema.shipments.subOrderId, ids));

    const remitted = new Map(shipments.map((s) => [s.subOrderId, s.remittedAt !== null]));

    return subs.map((r): SettlementSubOrder => {
      const snap = snapshotBySub.get(r.id);
      return {
        id: r.id,
        reference: r.reference,
        state: r.state,
        merchandise: Money.fromMinor(r.merchandisePiastres),
        shipping: Money.fromMinor(r.shippingPiastres),
        commissionSource: (snap?.source ?? 'unknown') as OrderSource,
        commissionBps: snap?.bps ?? 0,
        ...(r.deliveredAt ? { deliveredAt: r.deliveredAt } : {}),
        cashInHand: remitted.get(r.id) ?? false,
      };
    });
  },
});

export const repositoriesFor = (db: Executor): Repositories => ({
  sellers: sellerRepository(db),
  products: productRepository(db),
  orders: orderRepository(db),
  subOrders: subOrderRepository(db),
});

/**
 * Unit of Work over a real transaction.
 *
 * Order + sub-orders + line items commit together or not at all. A partially
 * written multi-seller order is unrecoverable: a house sees work it is not paid
 * for, and the customer's total reconciles to nothing.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: DiyarDatabase) {}

  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => work(repositoriesFor(tx as unknown as Executor)));
  }
}
