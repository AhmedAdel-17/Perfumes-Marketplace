/**
 * The owner report's facts, on Drizzle.
 *
 * Reads only, and judges nothing — see the port. Every rule about what
 * "completed", "late" or "held" means lives in `buildOwnerReport`, which is
 * why this file returns rows rather than totals.
 *
 * FIVE PLAIN QUERIES STITCHED IN MEMORY, not one clever join, for the reason
 * `listForSettlement` gives: a correlated subquery that silently fails to
 * resolve returns NULLs rather than an error, and on a money path that means a
 * wrong number with nothing to say it is wrong. Each query here is readable on
 * its own, and the stitching is plain code.
 */
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  Money,
  type OrderSource,
  type OwnerReportRepository,
  type OwnerReportSubOrder,
  type ReasonCode,
  type SettlementSubOrder,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

const EXITS = new Set(['rejected', 'cancelled', 'refused', 'returned']);

type SubOrderRow = typeof schema.subOrders.$inferSelect;

/**
 * What a payout needs to know about a set of sub-orders.
 *
 * Shared by `listForSettlement` and the owner report, so the two cannot
 * disagree about the commission snapshot or about whether the cash has
 * arrived — which is exactly what decides "earned" versus "held".
 *
 * CASH IN HAND IS "ANY SHIPMENT REMITTED". `shipments.sub_order_id` is not
 * unique, and `recordRemittance` updates every shipment row for a sub-order.
 * Building a map row by row, as the first version did, made the answer depend
 * on which row the database happened to return last whenever there were two.
 */
export async function settlementFacts(
  db: DiyarDatabase,
  subs: readonly SubOrderRow[],
): Promise<Map<string, SettlementSubOrder>> {
  const facts = new Map<string, SettlementSubOrder>();
  if (subs.length === 0) return facts;
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

  const shipments = await db
    .select({
      subOrderId: schema.shipments.subOrderId,
      remittedAt: schema.shipments.codRemittedAt,
    })
    .from(schema.shipments)
    .where(inArray(schema.shipments.subOrderId, ids));
  const remitted = new Set(shipments.filter((s) => s.remittedAt !== null).map((s) => s.subOrderId));

  for (const r of subs) {
    const snap = snapshotBySub.get(r.id);
    facts.set(r.id, {
      id: r.id,
      reference: r.reference,
      state: r.state,
      merchandise: Money.fromMinor(r.merchandisePiastres),
      shipping: Money.fromMinor(r.shippingPiastres),
      commissionSource: (snap?.source ?? 'unknown') as OrderSource,
      commissionBps: snap?.bps ?? 0,
      deliveryFulfilledBy: r.deliveryFulfilledBy,
      ...(r.deliveredAt ? { deliveredAt: r.deliveredAt } : {}),
      cashInHand: remitted.has(r.id),
    });
  }
  return facts;
}

export const ownerReportRepository = (db: DiyarDatabase): OwnerReportRepository => ({
  async facts({ from, to }) {
    // The COHORT: orders placed in [from, to). `orders.placed_at`, not the
    // sub-order's `created_at` — that is when a row was written, and the
    // question is when a customer bought.
    const orders = await db
      .select({
        id: schema.orders.id,
        placedAt: schema.orders.placedAt,
        discountPiastres: schema.orders.discountPiastres,
      })
      .from(schema.orders)
      .where(and(gte(schema.orders.placedAt, from), lt(schema.orders.placedAt, to)));

    const [tickets] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.supportTickets)
      .where(and(gte(schema.supportTickets.createdAt, from), lt(schema.supportTickets.createdAt, to)));

    const discounts = Money.fromMinor(orders.reduce((sum, o) => sum + o.discountPiastres, 0));
    const ticketCount = tickets?.count ?? 0;

    if (orders.length === 0) {
      return { subOrders: [], platformRefunds: Money.zero(), ticketCount, discounts };
    }

    const placedAtByOrder = new Map(orders.map((o) => [o.id, o.placedAt]));
    const subs = await db
      .select()
      .from(schema.subOrders)
      .where(inArray(schema.subOrders.orderId, orders.map((o) => o.id)));

    if (subs.length === 0) {
      return { subOrders: [], platformRefunds: Money.zero(), ticketCount, discounts };
    }
    const ids = subs.map((s) => s.id);

    const settlement = await settlementFacts(db, subs);

    // The house's reserve, read from the house — the same value a payout run
    // passes to the classifier for that house.
    const houses = await db
      .select({ id: schema.sellers.id, reserveDays: schema.sellers.payoutReserveDays })
      .from(schema.sellers)
      .where(inArray(schema.sellers.id, [...new Set(subs.map((s) => s.sellerId))]));
    const reserveBySeller = new Map(houses.map((h) => [h.id, h.reserveDays]));

    // The ANSWER is the first confirm-or-decline, and the exit reason is the
    // one on the move INTO the terminal state. Both come from the append-only
    // log, because `sub_orders` records neither a decline time nor a reason.
    const transitions = await db
      .select({
        subOrderId: schema.subOrderTransitions.subOrderId,
        toState: schema.subOrderTransitions.toState,
        reason: schema.subOrderTransitions.reason,
        occurredAt: schema.subOrderTransitions.occurredAt,
      })
      .from(schema.subOrderTransitions)
      .where(inArray(schema.subOrderTransitions.subOrderId, ids));

    const answeredAt = new Map<string, Date>();
    const exitReason = new Map<string, ReasonCode | null>();
    for (const t of transitions) {
      if (t.toState === 'confirmed' || t.toState === 'rejected') {
        const earlier = answeredAt.get(t.subOrderId);
        if (!earlier || t.occurredAt < earlier) answeredAt.set(t.subOrderId, t.occurredAt);
      }
      if (EXITS.has(t.toState)) exitReason.set(`${t.subOrderId}:${t.toState}`, t.reason);
    }

    const [refunds] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.returns.refundPiastres}), 0)::int` })
      .from(schema.returns)
      .where(and(
        inArray(schema.returns.subOrderId, ids),
        eq(schema.returns.costBearer, 'platform'),
      ));

    const subOrders: OwnerReportSubOrder[] = subs.map((r) => ({
      ...settlement.get(r.id)!,
      orderId: r.orderId,
      sellerId: r.sellerId,
      governorate: r.governorate,
      placedAt: placedAtByOrder.get(r.orderId)!,
      confirmDueAt: r.confirmDueAt,
      respondedAt: answeredAt.get(r.id) ?? null,
      confirmedAt: r.confirmedAt,
      dispatchDueAt: r.dispatchDueAt,
      dispatchedAt: r.dispatchedAt,
      exitReason: EXITS.has(r.state) ? (exitReason.get(`${r.id}:${r.state}`) ?? null) : null,
      reserveDays: reserveBySeller.get(r.sellerId) ?? 0,
    }));

    return {
      subOrders,
      platformRefunds: Money.fromMinor(refunds?.total ?? 0),
      ticketCount,
      discounts,
    };
  },
});
