/**
 * Support.
 *
 * The one router here that authorises nothing on the way in. Anybody may ask a
 * question — somebody deciding whether to buy is exactly who this exists for —
 * so `open` takes no order reference and no proof of anything.
 *
 * Reading a ticket back is the opposite: it holds a name, a phone and whatever
 * the person chose to tell us, so it needs the two factors everything else on
 * this path uses.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES,
  generateTicketReference, objectionsToOpening, priorityFor,
  type TicketObjection, type TicketRecord,
} from '@diyar/domain';
import { platformProcedure, publicProcedure, router } from '../trpc';
import { phoneSchema, uuidSchema } from '../validation';
import { consume, rateLimitMessage } from '../rate-limit';

const OBJECTION_COPY: Readonly<Record<TicketObjection, string>> = {
  subject_required: 'اكتب عنوانًا مختصرًا',
  subject_too_long: `العنوان أطول من ${SUBJECT_MAX} حرفًا`,
  message_required: 'اكتب رسالتك',
  message_too_long: `الرسالة أطول من ${MESSAGE_MAX} حرفًا`,
};
/**
 * Rate limit, keyed on the phone.
 *
 * Counted before anything is written, and counted whether or not the write
 * succeeds — see `rate-limit.ts` for why that matters on paths that
 * deliberately return the same answer to a valid and an invalid caller.
 */
const limit = (name: Parameters<typeof consume>[0], key: string): void => {
  const verdict = consume(name, key);
  if (!verdict.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: rateLimitMessage(verdict.retryAfterSeconds),
    });
  }
};


const ticketOut = (t: TicketRecord) => ({
  reference: t.reference,
  category: t.category,
  subject: t.subject,
  message: t.message,
  contactName: t.contactName,
  contactPhone: t.contactPhone,
  priority: t.priority,
  status: t.status,
  orderReference: t.orderReference,
  nextAction: t.nextAction,
  createdAt: t.createdAt.toISOString(),
  firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
  resolvedAt: t.resolvedAt?.toISOString() ?? null,
});

export const supportRouter = router({
  open: publicProcedure
    .input(z.object({
      category: z.enum(SUPPORT_CATEGORIES),
      subject: z.string().trim().min(1, OBJECTION_COPY.subject_required).max(SUBJECT_MAX),
      message: z.string().trim().min(1, OBJECTION_COPY.message_required).max(MESSAGE_MAX),
      contactName: z.string().trim().min(2, 'اكتب اسمك').max(80),
      contactPhone: phoneSchema,
      /**
       * Optional, and never required.
       *
       * A required order number turns a pre-sale question into a lost sale, and
       * this is the form somebody uses before they trust the shop enough to buy.
       */
      orderReference: z.string().trim().max(40).nullish(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      limit('ticket', input.contactPhone);

      const objections = objectionsToOpening({
        subject: input.subject,
        message: input.message,
      });
      if (objections.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: objections.map((o) => OBJECTION_COPY[o]).join(' · '),
        });
      }

      const ticket = await ctx.aftercareUow.transaction((r) => r.support.open({
        reference: generateTicketReference((n) => crypto.getRandomValues(new Uint8Array(n))),
        category: input.category,
        subject: input.subject,
        message: input.message,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        // DERIVED, never sent. A customer asked to rate their own urgency
        // answers "urgent" every time, and correctly — it is urgent to them.
        priority: priorityFor(input.category),
        /*
         * Passed as typed, and RESOLVED by the repository against this phone.
         * Deliberately not normalised to null on a bad format here: the
         * repository's sub-select is what decides whether it matches an order,
         * and a reference that matches nothing simply links to nothing.
         */
        orderReference: input.orderReference?.trim() || null,
        now: ctx.clock.now(),
      }));

      // The reference is the whole answer. It is what the customer writes down
      // and what they quote back, so it is returned rather than an id.
      return { reference: ticket.reference };
    }),

  /** Look a ticket up: its reference AND the phone it was opened on. */
  byReference: publicProcedure
    .input(z.object({
      reference: z.string().trim().min(3).max(40),
      phone: phoneSchema,
    }))
    .query(async ({ ctx, input }) => {
      const reference = input.reference.trim().toUpperCase().replace(/\s/g, '');
      const ticket = await ctx.aftercareUow.transaction((r) =>
        r.support.find({ reference, phone: input.phone }));
      return ticket ? ticketOut(ticket) : null;
    }),

  /* ---------------------------------------------------------- the operator */

  queue: platformProcedure
    .input(z.object({
      includeClosed: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.uow.transaction((r) => (input?.includeClosed
        ? r.support.listAll({ limit: input?.limit ?? 100 })
        : r.support.listOpen({ limit: input?.limit ?? 100 })));

      // The id is needed to act on a row, and it is not in the customer-facing
      // shape — an operator's list and a customer's receipt are different views
      // of the same ticket.
      return rows.map((t) => ({ id: t.id, ...ticketOut(t) }));
    }),

  update: platformProcedure
    .input(z.object({
      id: uuidSchema,
      status: z.enum(['open', 'waiting', 'resolved', 'closed']),
      nextAction: z.string().trim().max(500).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }

      const moved = await ctx.uow.transaction((r) => r.support.update({
        id: input.id,
        status: input.status,
        nextAction: input.nextAction?.trim() || null,
        ownerId: ctx.platformStaffId!,
        now: ctx.clock.now(),
      }));

      if (!moved) throw new TRPCError({ code: 'NOT_FOUND', message: 'التذكرة غير موجودة' });
      return { status: input.status };
    }),
});
