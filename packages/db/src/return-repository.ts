/**
 * Returns, on Drizzle.
 *
 * The write path is the same shape as the review one, and for the same reason:
 * `INSERT ... SELECT` with both factors in the WHERE clause, so the sub-order
 * is derived by the database from the line item rather than sent by the caller.
 * A line item belonging to somebody else's order matches no row.
 *
 * What differs is that a return is JUDGED elsewhere. This file returns the
 * facts — when the parcel arrived, what the listing's policy says, whether one
 * has already been asked for — and `objectionsToRequesting` rules on them. A
 * repository that returned `canReturn` would be a second place where fourteen
 * days is written down, and the one nobody updates when the law moves.
 */
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  Money,
  type ReturnRecord, type ReturnRepository, type ReturnableLine,
  type ReturnEligibility, type ReturnReason, type ReturnState,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

/** See the note in `review-repository.ts`: `PgDatabase.execute` is untyped. */
const execute = async <T>(db: DiyarDatabase, statement: SQL): Promise<readonly T[]> => {
  const result = await db.execute(statement) as { rows?: readonly T[] } | readonly T[];
  return Array.isArray(result) ? result : (result as { rows?: readonly T[] }).rows ?? [];
};

interface RecordRow {
  id: string;
  subOrderId: string;
  subOrderReference: string;
  sellerId: string;
  brandName: string;
  lineItemId: string | null;
  productName: string | null;
  status: string;
  reason: string;
  customerNote: string | null;
  costBearer: string;
  refundPiastres: number | null;
  requestedAt: Date;
  decidedAt: Date | null;
  closedAt: Date | null;
}

const toRecord = (r: RecordRow): ReturnRecord => ({
  id: r.id,
  subOrderId: r.subOrderId,
  subOrderReference: r.subOrderReference,
  sellerId: r.sellerId,
  brandName: r.brandName,
  lineItemId: r.lineItemId,
  productName: r.productName,
  state: r.status as ReturnState,
  reason: r.reason as ReturnReason,
  customerNote: r.customerNote,
  costBearer: r.costBearer as ReturnRecord['costBearer'],
  // Money crosses the boundary as Money. A bare number invites float
  // arithmetic on a refund, which is the one number a customer counts.
  refund: r.refundPiastres === null ? null : Money.fromMinor(r.refundPiastres),
  requestedAt: r.requestedAt,
  decidedAt: r.decidedAt,
  closedAt: r.closedAt,
});

const RECORD_SELECT = {
  id: schema.returns.id,
  subOrderId: schema.returns.subOrderId,
  subOrderReference: schema.subOrders.reference,
  sellerId: schema.subOrders.sellerId,
  brandName: schema.sellers.tradingName,
  lineItemId: schema.returns.lineItemId,
  productName: schema.orderLineItems.productName,
  status: schema.returns.status,
  reason: schema.returns.reason,
  customerNote: schema.returns.customerNote,
  costBearer: schema.returns.costBearer,
  refundPiastres: schema.returns.refundPiastres,
  requestedAt: schema.returns.requestedAt,
  decidedAt: schema.returns.decidedAt,
  closedAt: schema.returns.closedAt,
} as const;

export const returnRepository = (db: DiyarDatabase): ReturnRepository => {
  /**
   * The record query, joined once.
   *
   * `line_item_id` is nullable — a whole-parcel return names no line — so the
   * line item is a LEFT join. An inner one would silently drop exactly the
   * returns that are about a whole parcel, which are the expensive ones.
   */
  const records = () => db
    .select(RECORD_SELECT)
    .from(schema.returns)
    .innerJoin(schema.subOrders, eq(schema.subOrders.id, schema.returns.subOrderId))
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.subOrders.sellerId))
    .leftJoin(schema.orderLineItems, eq(schema.orderLineItems.id, schema.returns.lineItemId));

  return {
    async listReturnable({ reference, phone }) {
      const rows = await db
        .select({
          lineItemId: schema.orderLineItems.id,
          subOrderId: schema.subOrders.id,
          subOrderReference: schema.subOrders.reference,
          productName: schema.orderLineItems.productName,
          brandName: schema.orderLineItems.brandName,
          volumeMl: schema.orderLineItems.volumeMl,
          quantity: schema.orderLineItems.quantity,
          unitPricePiastres: schema.orderLineItems.unitPricePiastres,
          state: schema.subOrders.state,
          deliveredAt: schema.subOrders.deliveredAt,
          eligibility: schema.products.returnEligibility,
          existingReturn: schema.returns.id,
        })
        .from(schema.orderLineItems)
        .innerJoin(schema.subOrders, eq(schema.subOrders.id, schema.orderLineItems.subOrderId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.subOrders.orderId))
        .innerJoin(schema.products, eq(schema.products.id, schema.orderLineItems.productId))
        .leftJoin(schema.returns, eq(schema.returns.lineItemId, schema.orderLineItems.id))
        .where(and(
          eq(schema.orders.reference, reference),
          eq(schema.orders.contactPhone, phone),
        ))
        .orderBy(schema.orderLineItems.createdAt);

      return rows.map((r): ReturnableLine => ({
        lineItemId: r.lineItemId,
        subOrderId: r.subOrderId,
        subOrderReference: r.subOrderReference,
        productName: r.productName,
        brandName: r.brandName,
        volumeMl: r.volumeMl,
        quantity: r.quantity,
        unitPrice: Money.fromMinor(r.unitPricePiastres),
        /*
         * Null unless the parcel actually arrived.
         *
         * `delivered_at` is set on the row, but a sub-order that was later
         * RETURNED still carries it — so reading the column alone would offer a
         * second return on a bottle already sent back. The state is what says
         * the parcel is currently with the customer.
         */
        deliveredAt: r.state === 'delivered' ? r.deliveredAt : null,
        eligibility: (r.eligibility ?? null) as ReturnEligibility | null,
        alreadyRequested: r.existingReturn !== null,
      }));
    },

    async request({ reference, phone, lineItemId, reason, note, costBearer, now }) {
      const trimmed = note.trim();

      /*
       * INSERT ... SELECT, with both factors as the predicate.
       *
       * The `NOT EXISTS` is the "one request per bottle" rule. There is no
       * unique index on `returns.line_item_id` — a whole-parcel return leaves it
       * null, and a unique index over a nullable column would still permit two
       * of those — so the guard is here, inside the same statement, rather than
       * as a read followed by a write that another request can interleave with.
       */
      const inserted = await execute<{ id: string }>(db, sql`
        INSERT INTO returns (sub_order_id, line_item_id, reason, customer_note,
                             cost_bearer, status, requested_at)
        SELECT li.sub_order_id, li.id, ${reason}::reason_code,
               ${trimmed.length === 0 ? null : trimmed},
               ${costBearer}::cost_bearer, 'requested', ${now}
        FROM order_line_items li
        JOIN sub_orders s ON s.id = li.sub_order_id
        JOIN orders o     ON o.id = s.order_id
        WHERE li.id = ${lineItemId}
          AND o.reference = ${reference}
          AND o.contact_phone = ${phone}
          AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.line_item_id = li.id)
        RETURNING id
      `);

      const row = inserted[0];
      return row ? { id: row.id } : null;
    },

    async listForOrder({ reference, phone }) {
      const rows = await records()
        .innerJoin(schema.orders, eq(schema.orders.id, schema.subOrders.orderId))
        .where(and(
          eq(schema.orders.reference, reference),
          eq(schema.orders.contactPhone, phone),
        ))
        .orderBy(desc(schema.returns.requestedAt));
      return rows.map(toRecord);
    },

    async listForSeller(sellerId) {
      const rows = await records()
        .where(eq(schema.subOrders.sellerId, sellerId))
        .orderBy(desc(schema.returns.requestedAt));
      return rows.map(toRecord);
    },

    async listAll({ limit }) {
      const rows = await records()
        .orderBy(desc(schema.returns.requestedAt))
        .limit(limit);
      return rows.map(toRecord);
    },

    async findById(id) {
      const rows = await records().where(eq(schema.returns.id, id)).limit(1);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async move({ id, expectedFrom, to, decidedBy, costBearer, refundPiastres, now }) {
      /*
       * `status = expectedFrom` in the WHERE, not a read followed by a check.
       *
       * Two operators looking at the same queue click at the same time; one of
       * them is acting on a screen that is already stale. An unconditional
       * write lets the second silently overwrite the first's decision, and the
       * only trace is a `decided_by` that no longer matches the outcome.
       */
      const updated = await db.update(schema.returns)
        .set({
          status: to,
          decidedBy,
          decidedAt: now,
          ...(costBearer === undefined ? {} : { costBearer }),
          ...(refundPiastres === undefined ? {} : { refundPiastres }),
          ...(to === 'closed' ? { closedAt: now } : {}),
        })
        .where(and(eq(schema.returns.id, id), eq(schema.returns.status, expectedFrom)))
        .returning({ id: schema.returns.id });

      return updated.length > 0;
    },
  };
};
