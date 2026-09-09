/**
 * Returns.
 *
 * A FACADE. The repository supplies facts, the domain rules on them, and this
 * file translates between the two and the wire. Every number in here — fourteen
 * days, thirty days, who pays — comes from `@diyar/domain`, so there is exactly
 * one place where the returns policy is written down.
 *
 * The customer half runs as the `aftercare` service role, because a guest has
 * no account. The seller and platform halves run as the caller, under the RLS
 * policies that already isolate a house's own sub-orders.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  RETURN_REASONS, RETURN_STATES, ReturnLifecycle,
  normaliseOrderReference, objectionsToRequesting, permittedReasons, proposedCostBearer,
  windowDaysFor,
  type ReturnObjection, type ReturnRecord, type ReturnState,
} from '@diyar/domain';
import { platformProcedure, publicProcedure, router, sellerProcedure } from '../trpc';
import { phoneSchema, uuidSchema } from '../validation';
import { consume, rateLimitMessage } from '../rate-limit';

const factorsSchema = z.object({
  reference: z.string().trim().min(3).max(40),
  phone: phoneSchema,
});

/** Arabic for every way a request can be refused. */
const OBJECTION_COPY: Readonly<Record<ReturnObjection, string>> = {
  reason_not_permitted: 'سياسة الإرجاع لهذا المنتج لا تشمل هذا السبب',
  window_closed: 'انتهت مدة الإرجاع لهذا الطلب',
  not_delivered: 'لم يصلك الطلب بعد',
  already_requested: 'يوجد طلب إرجاع لهذا المنتج بالفعل',
  note_required: 'اكتب سطرًا يوضّح المشكلة',
};

const recordOut = (r: ReturnRecord) => ({
  id: r.id,
  subOrderReference: r.subOrderReference,
  brandName: r.brandName,
  productName: r.productName,
  state: r.state,
  reason: r.reason,
  customerNote: r.customerNote,
  costBearer: r.costBearer,
  refundPiastres: r.refund?.minor ?? null,
  requestedAt: r.requestedAt.toISOString(),
  decidedAt: r.decidedAt?.toISOString() ?? null,
  closedAt: r.closedAt?.toISOString() ?? null,
});
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


export const returnsRouter = router({
  /**
   * What this order could ask to send back, already judged.
   *
   * The JUDGEMENT happens here rather than on the screen: a client that decided
   * for itself which reasons to offer would be a second copy of the policy, and
   * it would be the copy an attacker can edit. The screen renders what it is
   * given.
   */
  returnable: publicProcedure
    .input(factorsSchema)
    .query(async ({ ctx, input }) => {
      const reference = normaliseOrderReference(input.reference);
      if (!reference) return [];

      const lines = await ctx.aftercareUow.transaction((r) =>
        r.returns.listReturnable({ reference, phone: input.phone }));

      const now = ctx.clock.now();

      return lines.map((line) => {
        const reasons = permittedReasons(line.eligibility);
        return {
          lineItemId: line.lineItemId,
          subOrderReference: line.subOrderReference,
          productName: line.productName,
          brandName: line.brandName,
          volumeMl: line.volumeMl,
          quantity: line.quantity,
          unitPricePiastres: line.unitPrice.minor,
          delivered: line.deliveredAt !== null,
          alreadyRequested: line.alreadyRequested,
          /*
           * Only the reasons still INSIDE their window.
           *
           * A change of mind expires at fourteen days and a fault at thirty, so
           * on day twenty a customer may still report a defect and may no
           * longer change their mind. Offering the expired one and refusing it
           * on submit is a worse screen than not offering it.
           */
          reasons: reasons.filter((reason) => objectionsToRequesting({
            reason,
            eligibility: line.eligibility,
            deliveredAt: line.deliveredAt,
            alreadyRequested: line.alreadyRequested,
            // A note is the customer's to write; it cannot be judged yet.
            note: 'x',
            now,
          }).length === 0),
          daysLeft: line.deliveredAt === null ? null : Math.max(
            0,
            Math.ceil(
              windowDaysFor('changed_mind')
              - (now.getTime() - line.deliveredAt.getTime()) / 86_400_000,
            ),
          ),
        };
      });
    }),

  request: publicProcedure
    .input(factorsSchema.extend({
      lineItemId: uuidSchema,
      reason: z.enum(RETURN_REASONS),
      note: z.string().trim().min(1, 'اكتب سطرًا يوضّح المشكلة').max(1_000),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      limit('aftercare', input.phone);

      const reference = normaliseOrderReference(input.reference);
      if (!reference) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد طلب مطابق' });
      }

      const now = ctx.clock.now();

      return ctx.aftercareUow.transaction(async (r) => {
        const lines = await r.returns.listReturnable({ reference, phone: input.phone });
        const line = lines.find((l) => l.lineItemId === input.lineItemId);
        if (!line) {
          // Same undifferentiated answer as everywhere else on this path.
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يمكن إرجاع هذا المنتج' });
        }

        // The domain decides, and reports every objection at once.
        const objections = objectionsToRequesting({
          reason: input.reason,
          eligibility: line.eligibility,
          deliveredAt: line.deliveredAt,
          alreadyRequested: line.alreadyRequested,
          note: input.note,
          now,
        });
        if (objections.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: objections.map((o) => OBJECTION_COPY[o]).join(' · '),
          });
        }

        const asked = await r.returns.request({
          reference,
          phone: input.phone,
          lineItemId: input.lineItemId,
          reason: input.reason,
          note: input.note,
          // From the DOMAIN. Doc 06 §7: cost allocation depends on the reason,
          // so it is decided by the rule rather than by whoever is annoyed.
          costBearer: proposedCostBearer(input.reason),
          now,
        });

        /*
         * Null here means the row was taken between the read above and this
         * write — a double-tap, or two tabs. The `NOT EXISTS` inside the insert
         * is what makes that safe; this is only how it is reported.
         */
        if (!asked) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: OBJECTION_COPY.already_requested,
          });
        }

        return { id: asked.id };
      });
    }),

  /** What this order has already asked for. */
  mine: publicProcedure
    .input(factorsSchema)
    .query(async ({ ctx, input }) => {
      const reference = normaliseOrderReference(input.reference);
      if (!reference) return [];
      const rows = await ctx.aftercareUow.transaction((r) =>
        r.returns.listForOrder({ reference, phone: input.phone }));
      return rows.map(recordOut);
    }),

  /* ------------------------------------------------------------- the house */

  queue: sellerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.returns.listForSeller(ctx.sellerId));
    return rows.map(recordOut);
  }),

  /**
   * A house decides on a return of its own.
   *
   * Restricted to the moves a house may legally make — the domain's table says
   * which, and this passes `'seller'` as the actor rather than trusting the
   * request. A house cannot refund: money is the platform's to move, and a
   * house that could mark a return refunded could close a case without paying.
   */
  decide: sellerProcedure
    .input(z.object({
      id: uuidSchema,
      to: z.enum(RETURN_STATES),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const found = await r.returns.findById(input.id);
        // RLS already restricts the read to this house's sub-orders, so a
        // return belonging to another house is simply not found.
        if (!found || found.sellerId !== ctx.sellerId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'طلب الإرجاع غير موجود' });
        }

        ReturnLifecycle.assert(found.state, input.to, 'seller');

        const moved = await r.returns.move({
          id: input.id,
          expectedFrom: found.state,
          to: input.to,
          decidedBy: ctx.sellerId,
          now: ctx.clock.now(),
        });
        if (!moved) {
          // Somebody else moved it between the read and the write.
          throw new TRPCError({ code: 'CONFLICT', message: 'تغيّرت حالة الطلب. حدّث الصفحة.' });
        }

        return { state: input.to };
      });
    }),

  /* ---------------------------------------------------------- the platform */

  all: platformProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.uow.transaction((r) =>
        r.returns.listAll({ limit: input?.limit ?? 100 }));
      return rows.map(recordOut);
    }),

  /**
   * The platform's decision, including the one that moves money.
   *
   * `refundPiastres` is accepted only alongside `refunded`, and the domain
   * refuses to reach `refunded` from anywhere but `received` — so a refund
   * cannot be issued on a bottle nobody has held.
   */
  resolve: platformProcedure
    .input(z.object({
      id: uuidSchema,
      to: z.enum(RETURN_STATES),
      refundPiastres: z.number().int().min(0).max(10_000_000).optional(),
      costBearer: z.enum(['seller', 'platform', 'customer', 'courier', 'unallocated']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }
      const staffId = ctx.platformStaffId;

      if (input.refundPiastres !== undefined && input.to !== 'refunded') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'المبلغ يُسجَّل مع ردّ المبلغ فقط',
        });
      }
      if (input.to === 'refunded' && input.refundPiastres === undefined) {
        // A refund with no amount is a case closed with nothing paid, which is
        // the shape a dispute takes six weeks later.
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'أدخل المبلغ المردود' });
      }

      return ctx.uow.transaction(async (r) => {
        const found = await r.returns.findById(input.id);
        if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'طلب الإرجاع غير موجود' });

        ReturnLifecycle.assert(found.state, input.to as ReturnState, 'platform');

        const moved = await r.returns.move({
          id: input.id,
          expectedFrom: found.state,
          to: input.to,
          decidedBy: staffId,
          ...(input.costBearer === undefined ? {} : { costBearer: input.costBearer }),
          ...(input.refundPiastres === undefined ? {} : { refundPiastres: input.refundPiastres }),
          now: ctx.clock.now(),
        });
        if (!moved) {
          throw new TRPCError({ code: 'CONFLICT', message: 'تغيّرت حالة الطلب. حدّث الصفحة.' });
        }

        /*
         * Money moving, and who moved it.
         *
         * A refund is an adjustment to what a house is owed, so it belongs in
         * the audit trail beside payout approvals — doc 04 §8 names exactly
         * this class of decision.
         */
        if (input.to === 'refunded' || input.costBearer !== undefined) {
          await r.audit.record({
            action: 'payout_adjustment',
            actorId: staffId,
            actorLabel: ctx.platformLabel ?? 'platform',
            entityTable: 'returns',
            entityId: input.id,
            before: JSON.stringify({ state: found.state, costBearer: found.costBearer }),
            after: JSON.stringify({
              state: input.to,
              costBearer: input.costBearer ?? found.costBearer,
              refundPiastres: input.refundPiastres ?? null,
            }),
          });
        }

        return { state: input.to };
      });
    }),
});
