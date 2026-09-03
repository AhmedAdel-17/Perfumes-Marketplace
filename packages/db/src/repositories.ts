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
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  Money, SubOrderLifecycle, InvalidTransition,
  type Actor, type OrderSource, type ReasonCode, type SettlementSubOrder,
  type SubOrderState, type TransitionRecord,
  type CustomerRepository, type PayoutRepository,
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

const customerRepository = (db: Executor): CustomerRepository => ({
  async findOrCreateByPhone({ phone, fullName }) {
    // ON CONFLICT rather than SELECT-then-INSERT: two tabs checking out at once
    // would both see "no such customer" and both insert, and one would lose to
    // the unique index. The name is refreshed because the most recent checkout
    // is the best thing we know about how to address them.
    const [row] = await db
      .insert(schema.customers)
      .values({ phone, fullName })
      .onConflictDoUpdate({
        target: schema.customers.phone,
        set: { fullName, updatedAt: new Date() },
      })
      .returning({
        id: schema.customers.id,
        phone: schema.customers.phone,
        fullName: schema.customers.fullName,
        authUserId: schema.customers.authUserId,
      });

    return {
      id: row!.id,
      phone: row!.phone,
      fullName: row!.fullName,
      authUserId: row!.authUserId,
    };
  },

  async listPriorPurchaseSellerIds(customerId) {
    const rows = await db
      .selectDistinct({ sellerId: schema.subOrders.sellerId })
      .from(schema.subOrders)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.subOrders.orderId))
      .where(eq(schema.orders.customerId, customerId));
    return new Set(rows.map((r) => r.sellerId));
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

  async snapshotForCart(productIds) {
    // `inArray` with an empty list generates `IN ()`, which is a syntax error in
    // Postgres rather than an empty result. An empty cart is the most ordinary
    // state a cart has, so it must not be able to take the page down.
    if (productIds.length === 0) return [];

    const rows = await db
      .select({
        p: schema.products,
        brandName: schema.brands.name,
        brandEn: schema.brands.nameEn,
        sellerStatus: schema.sellers.status,
      })
      .from(schema.products)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
      .where(inArray(schema.products.id, [...productIds]));

    return rows.map((r) => ({
      productId: r.p.id,
      sellerId: r.p.sellerId,
      slug: r.p.slug,
      name: r.p.name,
      brandName: r.brandName,
      brandLatin: (r.brandEn ?? r.brandName).toUpperCase(),
      sku: r.p.sku,
      volumeMl: r.p.volumeMl,
      scentFamily: r.p.scentFamily ?? 'amber',
      unitPrice: Money.fromMinor(r.p.promoPricePiastres ?? r.p.pricePiastres),
      stock: r.p.stock,
      // Reported honestly rather than assumed true. RLS already hides rows an
      // anonymous visitor may not see, but the platform role sees everything,
      // and a cart priced as platform must reach the same verdict as one priced
      // as a shopper.
      isPublished: r.p.status === 'published',
      isHouseLive: r.sellerStatus === 'live',
      fulfilmentHours: r.p.fulfilmentHours,
    }));
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
        // The house cannot read the parent order — that would show it what the
        // customer bought from competing houses — so everything it needs to
        // pack and label is written onto its own row. Migration 0004.
        recipientName: draft.contactName,
        recipientPhone: draft.contactPhone,
        governorate: a.governorate,
        city: a.city,
        area: a.area,
        street: a.street,
        building: a.building,
        floor: a.floor ?? null,
        apartment: a.apartment ?? null,
        landmark: a.landmark ?? null,
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

  async findForCustomerLookup({ reference, phone }) {
    // Both factors in the WHERE clause. Matching the phone afterwards in
    // TypeScript is the version of this that shipped and disclosed every order
    // to anyone holding a reference.
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(
        eq(schema.orders.reference, reference),
        eq(schema.orders.contactPhone, phone),
      ))
      .limit(1);

    if (!order) return null;

    const subs = await db
      .select({ sub: schema.subOrders, brandName: schema.sellers.tradingName })
      .from(schema.subOrders)
      .innerJoin(schema.sellers, eq(schema.sellers.id, schema.subOrders.sellerId))
      .where(eq(schema.subOrders.orderId, order.id));

    const items = await db
      .select()
      .from(schema.orderLineItems)
      .where(inArray(schema.orderLineItems.subOrderId, subs.map((s) => s.sub.id)));

    const parcels = await db
      .select({
        subOrderId: schema.shipments.subOrderId,
        trackingNumber: schema.shipments.trackingNumber,
      })
      .from(schema.shipments)
      .where(inArray(schema.shipments.subOrderId, subs.map((s) => s.sub.id)));

    return {
      reference: order.reference,
      contactName: order.contactName,
      placedAt: order.placedAt,
      paymentMethod: order.paymentMethod,
      total: Money.fromMinor(order.totalPiastres),
      houses: subs.map((s) => ({
        subOrderId: s.sub.id,
        trackingNumber:
          parcels.find((p) => p.subOrderId === s.sub.id)?.trackingNumber ?? null,
        reference: s.sub.reference,
        sellerId: s.sub.sellerId,
        brandName: s.brandName,
        state: s.sub.state,
        merchandise: Money.fromMinor(s.sub.merchandisePiastres),
        shipping: Money.fromMinor(s.sub.shippingPiastres),
        items: items
          .filter((i) => i.subOrderId === s.sub.id)
          .map((i) => ({
            name: i.productName,
            brandName: i.brandName,
            quantity: i.quantity,
            unitPrice: Money.fromMinor(i.unitPricePiastres),
          })),
      })),
    };
  },
});

const subOrderRepository = (db: Executor): SubOrderRepository => ({
  async findById(id) {
    const [row] = await db.select().from(schema.subOrders)
      .where(eq(schema.subOrders.id, id)).limit(1);
    return row ? toSubOrder(row) : null;
  },

  async recordShipment({ subOrderId, courier, trackingNumber, labelUrl, codAmountPiastres, dispatchedAt }) {
    await db.insert(schema.shipments).values({
      subOrderId,
      courier,
      trackingNumber,
      labelUrl,
      codAmountPiastres,
      dispatchedAt,
    });
    // Mirrored onto the sub-order so the queue and the tracking page do not
    // have to join to shipments for a single timestamp.
    await db.update(schema.subOrders)
      .set({ dispatchedAt })
      .where(eq(schema.subOrders.id, subOrderId));
  },

  async findShipment(subOrderId) {
    const [row] = await db
      .select({
        courier: schema.shipments.courier,
        trackingNumber: schema.shipments.trackingNumber,
        dispatchedAt: schema.shipments.dispatchedAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.subOrderId, subOrderId))
      .limit(1);
    return row ?? null;
  },

  async listQueueForSeller(sellerId) {
    const rows = await db
      .select()
      .from(schema.subOrders)
      .where(eq(schema.subOrders.sellerId, sellerId));

    if (rows.length === 0) return [];

    const items = await db
      .select()
      .from(schema.orderLineItems)
      .where(inArray(schema.orderLineItems.subOrderId, rows.map((r) => r.id)));

    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      state: r.state,
      merchandise: Money.fromMinor(r.merchandisePiastres),
      shipping: Money.fromMinor(r.shippingPiastres),
      placedAt: r.createdAt,
      confirmDueAt: r.confirmDueAt,
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      governorate: r.governorate,
      city: r.city,
      area: r.area,
      street: r.street,
      building: r.building,
      floor: r.floor,
      apartment: r.apartment,
      landmark: r.landmark,
      items: items
        .filter((i) => i.subOrderId === r.id)
        .map((i) => ({
          name: i.productName,
          sku: i.sku,
          volumeMl: i.volumeMl,
          quantity: i.quantity,
        })),
    }));
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

  async recordRemittance({ subOrderId, collectedPiastres, remittedAt }) {
    // Written on the SHIPMENT, not the sub-order, because remittance is a fact
    // about the parcel and the courier — how much came back and when. The
    // sub-order's state says where the order is; this says where the money is.
    await db.update(schema.shipments)
      .set({ codCollectedPiastres: collectedPiastres, codRemittedAt: remittedAt })
      .where(eq(schema.shipments.subOrderId, subOrderId));
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


const payoutRepository = (db: Executor): PayoutRepository => ({
  async save({ sellerId, reference, statement }) {
    const [payout] = await db.insert(schema.payouts).values({
      sellerId,
      reference,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      grossPiastres: statement.gross.minor,
      commissionPiastres: statement.commission.minor,
      shippingPiastres: statement.shipping.minor,
      adjustmentsPiastres: statement.adjustments.minor,
      netPiastres: statement.net.minor,
      disputeDeadline: statement.disputeDeadline,
    }).returning({ id: schema.payouts.id });

    const payoutId = payout!.id;

    // Only money that actually moved this period. A held line is not owed yet
    // and reappears in a later run once the hold clears; persisting it now
    // would double-count it then.
    for (const line of statement.lines) {
      if (line.outcome !== 'earned' && line.outcome !== 'reversed') continue;
      await db.insert(schema.payoutLines).values({
        payoutId,
        subOrderId: line.subOrderId,
        grossPiastres: line.gross.minor,
        commissionPiastres: line.commission.minor,
        commissionSource: line.commissionSource,
        commissionBps: line.commissionBps,
        shippingPiastres: line.shipping.minor,
        netPiastres: line.net.minor,
      });
    }

    return { id: payoutId, reference };
  },

  async listForSeller(sellerId) {
    const rows = await db.select().from(schema.payouts)
      .where(eq(schema.payouts.sellerId, sellerId));
    return rows.map(toPayoutSummary);
  },

  async findWithLines({ payoutId, sellerId }) {
    // Scoped by seller as well as id. RLS refuses another house's payout
    // anyway; matching on both means the query cannot even express the ask.
    const [row] = await db.select().from(schema.payouts)
      .where(and(eq(schema.payouts.id, payoutId), eq(schema.payouts.sellerId, sellerId)))
      .limit(1);
    if (!row) return null;

    const lines = await db
      .select({ line: schema.payoutLines, reference: schema.subOrders.reference })
      .from(schema.payoutLines)
      .innerJoin(schema.subOrders, eq(schema.subOrders.id, schema.payoutLines.subOrderId))
      .where(eq(schema.payoutLines.payoutId, payoutId));

    return {
      ...toPayoutSummary(row),
      lines: lines.map((l) => ({
        subOrderReference: l.reference,
        gross: Money.fromMinor(l.line.grossPiastres),
        commission: Money.fromMinor(l.line.commissionPiastres),
        commissionSource: l.line.commissionSource,
        commissionBps: l.line.commissionBps,
        shipping: Money.fromMinor(l.line.shippingPiastres),
        net: Money.fromMinor(l.line.netPiastres),
      })),
    };
  },
});

const toPayoutSummary = (row: typeof schema.payouts.$inferSelect) => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  gross: Money.fromMinor(row.grossPiastres),
  commission: Money.fromMinor(row.commissionPiastres),
  net: Money.fromMinor(row.netPiastres),
  disputeDeadline: row.disputeDeadline,
  paidAt: row.paidAt,
});

export const repositoriesFor = (db: Executor): Repositories => ({
  sellers: sellerRepository(db),
  customers: customerRepository(db),
  products: productRepository(db),
  orders: orderRepository(db),
  subOrders: subOrderRepository(db),
  payouts: payoutRepository(db),
});

/** Who is making the request. Drives every RLS policy in migration 0002. */
export interface ActorContext {
  /**
   * `checkout` is a SERVICE role, not a user role: it is set only inside the
   * order-placement transaction, after the router has validated the request,
   * and it can create an order and read back what it just wrote. See 0003.
   */
  readonly role: 'anon' | 'customer' | 'seller' | 'platform' | 'checkout';
  /** The Supabase auth user id. Null for anonymous traffic. */
  readonly id: string | null;
}

export const ANONYMOUS: ActorContext = { role: 'anon', id: null };

/**
 * Unit of Work over a real transaction, carrying the actor.
 *
 * Two jobs, and the second is easy to forget:
 *
 *  1. Order + sub-orders + line items commit together or not at all. A partially
 *     written multi-seller order is unrecoverable — a house sees work it is not
 *     paid for, and the customer's total reconciles to nothing.
 *
 *  2. It sets `app.actor_role` and `app.actor_id` inside the transaction, which
 *     is what makes the RLS policies in 0002 apply to THIS request. Without it
 *     every policy evaluates against an empty actor and the isolation proved in
 *     rls.test.ts does nothing in production. `set_config(..., true)` scopes the
 *     setting to the transaction, so it cannot leak to the next request sharing
 *     the connection.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: DiyarDatabase,
    private readonly actor: ActorContext = ANONYMOUS,
    /**
     * The unprivileged role every request runs as.
     *
     * Postgres NEVER applies row-level security to a superuser, or to a role
     * with BYPASSRLS — whatever the policies say and whatever GUCs are set. A
     * pool that happens to connect as the owner therefore bypasses every policy
     * in 0002 silently, and an API test caught exactly that: one house
     * successfully confirmed a competitor's sub-order.
     *
     * In Supabase this is `authenticated`/`anon`; here it is `app_user`, created
     * in 0002. Setting it per transaction means the guarantee holds no matter
     * which role the connection pool was opened with.
     */
    private readonly databaseRole: string = 'app_user',
  ) {}

  /** A view of the same database as a different actor. */
  as(actor: ActorContext): DrizzleUnitOfWork {
    return new DrizzleUnitOfWork(this.db, actor, this.databaseRole);
  }

  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Executor;
      // Order matters: set the actor while still privileged, then drop the role.
      await t.execute(sql`SELECT set_config('app.actor_role', ${this.actor.role}, true)`);
      await t.execute(sql`SELECT set_config('app.actor_id', ${this.actor.id ?? ''}, true)`);
      await t.execute(sql.raw(`SET LOCAL ROLE ${this.databaseRole}`));
      return work(repositoriesFor(t));
    });
  }
}
