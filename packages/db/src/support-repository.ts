/**
 * Support tickets, on Drizzle.
 *
 * The two interesting lines in this file are both about NOT trusting the
 * request: the order link is resolved by a sub-select constrained by the
 * caller's own phone, and `first_response_at` is written only where it is
 * still null.
 */
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import {
  type SupportCategory, type SupportRepository, type TicketPriority,
  type TicketRecord, type TicketStatus,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

/** See the note in `review-repository.ts`: `PgDatabase.execute` is untyped. */
const execute = async <T>(db: DiyarDatabase, statement: SQL): Promise<readonly T[]> => {
  const result = await db.execute(statement) as { rows?: readonly T[] } | readonly T[];
  return Array.isArray(result) ? result : (result as { rows?: readonly T[] }).rows ?? [];
};

interface Row {
  id: string;
  reference: string;
  category: string;
  subject: string;
  message: string;
  contactName: string;
  contactPhone: string;
  priority: string;
  status: string;
  orderReference: string | null;
  nextAction: string | null;
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
}

const toRecord = (r: Row): TicketRecord => ({
  id: r.id,
  reference: r.reference,
  category: r.category as SupportCategory,
  subject: r.subject,
  message: r.message,
  contactName: r.contactName,
  contactPhone: r.contactPhone,
  priority: r.priority as TicketPriority,
  status: r.status as TicketStatus,
  orderReference: r.orderReference,
  nextAction: r.nextAction,
  createdAt: r.createdAt,
  firstResponseAt: r.firstResponseAt,
  resolvedAt: r.resolvedAt,
});

const SELECT = {
  id: schema.supportTickets.id,
  reference: schema.supportTickets.reference,
  category: schema.supportTickets.category,
  subject: schema.supportTickets.subject,
  message: schema.supportTickets.message,
  contactName: schema.supportTickets.contactName,
  contactPhone: schema.supportTickets.contactPhone,
  priority: schema.supportTickets.priority,
  status: schema.supportTickets.status,
  orderReference: schema.orders.reference,
  nextAction: schema.supportTickets.nextAction,
  createdAt: schema.supportTickets.createdAt,
  firstResponseAt: schema.supportTickets.firstResponseAt,
  resolvedAt: schema.supportTickets.resolvedAt,
} as const;

export const supportRepository = (db: DiyarDatabase): SupportRepository => {
  const tickets = () => db
    .select(SELECT)
    .from(schema.supportTickets)
    // LEFT: most tickets have no order, and an inner join would return none of
    // them — including every pre-sale question, which is the traffic this form
    // exists to catch.
    .leftJoin(schema.orders, eq(schema.orders.id, schema.supportTickets.orderId));

  return {
    async open(input) {
      /*
       * The order link is RESOLVED, not accepted.
       *
       * A reference typed into a public form is a claim about somebody else's
       * order until it is checked against the phone that came with it. The
       * sub-select does the checking, so a reference belonging to a different
       * customer resolves to NULL — the ticket is still opened, because a
       * customer mistyping their own order number should still reach a human,
       * but it is not attached to an order that is not theirs.
       *
       * `customer_id` is filled the same way: only when the phone already
       * belongs to a customer. A question is not a purchase, and it should not
       * create a customer record for somebody who never bought anything.
       */
      const rows = await execute<{ id: string }>(db, sql`
        INSERT INTO support_tickets (
          reference, category, subject, message,
          contact_name, contact_phone, priority, status,
          order_id, customer_id, created_at
        )
        VALUES (
          ${input.reference}, ${input.category}, ${input.subject.trim()}, ${input.message.trim()},
          ${input.contactName.trim()}, ${input.contactPhone},
          ${input.priority}::ticket_priority, 'open',
          (SELECT o.id FROM orders o
            WHERE o.reference = ${input.orderReference}
              AND o.contact_phone = ${input.contactPhone}
            LIMIT 1),
          (SELECT c.id FROM customers c WHERE c.phone = ${input.contactPhone} LIMIT 1),
          ${input.now}
        )
        RETURNING id
      `);

      const created = rows[0]!;
      const [row] = await tickets().where(eq(schema.supportTickets.id, created.id)).limit(1);
      return toRecord(row!);
    },

    async find({ reference, phone }) {
      // Both factors together, as a predicate. Same rule as order tracking: a
      // wrong phone and an unknown reference return the same null.
      const [row] = await tickets()
        .where(and(
          eq(schema.supportTickets.reference, reference),
          eq(schema.supportTickets.contactPhone, phone),
        ))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async listOpen({ limit }) {
      const rows = await tickets()
        .where(sql`${schema.supportTickets.status} IN ('open','waiting')`)
        // Priority first, then oldest. Sorted by arrival, the P1 that came in
        // this morning sits behind twelve questions from last week.
        .orderBy(asc(schema.supportTickets.priority), asc(schema.supportTickets.createdAt))
        .limit(limit);
      return rows.map(toRecord);
    },

    async listAll({ limit }) {
      const rows = await tickets()
        .orderBy(desc(schema.supportTickets.createdAt))
        .limit(limit);
      return rows.map(toRecord);
    },

    async update({ id, status, nextAction, ownerId, now }) {
      const updated = await db.update(schema.supportTickets)
        .set({
          status,
          nextAction,
          ownerId,
          ...(status === 'resolved' || status === 'closed' ? { resolvedAt: now } : {}),
        })
        .where(eq(schema.supportTickets.id, id))
        .returning({ id: schema.supportTickets.id });

      if (updated.length === 0) return false;

      /*
       * The first response, stamped once.
       *
       * `WHERE first_response_at IS NULL` rather than a read-then-write: this
       * number is how long somebody waited to hear from a human, and a field
       * overwritten on every subsequent update measures the last touch instead
       * — which is a metric that always looks excellent.
       */
      await db.update(schema.supportTickets)
        .set({ firstResponseAt: now })
        .where(and(
          eq(schema.supportTickets.id, id),
          isNull(schema.supportTickets.firstResponseAt),
        ));

      return true;
    },
  };
};
