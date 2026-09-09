/**
 * Reviews.
 *
 * A FACADE, like every router here: it validates, chooses the right unit of
 * work, calls one repository method and maps the result. The rules about what a
 * review may be live in `@diyar/domain`; the rules about who may write one live
 * in the repository's WHERE clause and in migration 0015's trigger.
 *
 * The write path runs as the `aftercare` SERVICE role, because the customer
 * writing it has no account — the phone is the identity, and the order
 * reference is the second factor. The read paths run as the caller, because a
 * published review is public.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  RATING_MAX, RATING_MIN, REVIEW_BODY_MAX, REVIEW_DIMENSIONS,
  EMPTY_SUMMARY, normaliseOrderReference, objectionsToHiding, objectionsToReview,
  type ReviewObjection, type ReviewSummary,
} from '@diyar/domain';
import { platformProcedure, publicProcedure, router } from '../trpc';
import { phoneSchema, uuidSchema } from '../validation';
import { consume, rateLimitMessage } from '../rate-limit';

/**
 * One rating.
 *
 * `int()` before the range, so "4.5" is refused for being a half star rather
 * than accepted as being inside the scale — the domain says the same thing, and
 * this exists so a malformed request is answered in Arabic before it gets
 * there.
 */
const ratingSchema = z.number()
  .int('التقييم يجب أن يكون رقمًا صحيحًا')
  .min(RATING_MIN, 'التقييم من ١ إلى ٥')
  .max(RATING_MAX, 'التقييم من ١ إلى ٥');

/**
 * The six, built from the domain's tuple rather than typed out.
 *
 * A dimension added to `REVIEW_DIMENSIONS` and forgotten here would be accepted
 * as absent and stored as whatever the database defaulted to. Deriving the
 * schema makes that a compile-time impossibility instead of a review comment.
 */
const ratingsSchema = z.object(
  Object.fromEntries(REVIEW_DIMENSIONS.map((d) => [d, ratingSchema])) as Record<
    (typeof REVIEW_DIMENSIONS)[number], typeof ratingSchema
  >,
).strict();

/** Both factors, together, on every aftercare request. */
const factorsSchema = z.object({
  reference: z.string().trim().min(3).max(40),
  phone: phoneSchema,
});

/** Arabic for each way a review can be refused. */
const OBJECTION_COPY: Readonly<Record<ReviewObjection, string>> = {
  rating_out_of_range: 'كل تقييم من ١ إلى ٥',
  rating_not_whole: 'اختر نجمة كاملة',
  body_too_long: `النص أطول من ${REVIEW_BODY_MAX} حرفًا`,
};

const summaryOut = (summary: ReviewSummary) => ({
  count: summary.count,
  overall: summary.overall,
  byDimension: summary.byDimension,
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


export const reviewsRouter = router({
  /**
   * What this order may review.
   *
   * Empty for a wrong phone exactly as for an unknown reference, so it cannot
   * be used to discover which references exist.
   */
  reviewable: publicProcedure
    .input(factorsSchema)
    .query(async ({ ctx, input }) => {
      const reference = normaliseOrderReference(input.reference);
      if (!reference) return [];

      const lines = await ctx.aftercareUow.transaction((r) =>
        r.reviews.listReviewable({ reference, phone: input.phone }));

      return lines.map((l) => ({
        lineItemId: l.lineItemId,
        productId: l.productId,
        productSlug: l.productSlug,
        productName: l.productName,
        brandName: l.brandName,
        volumeMl: l.volumeMl,
        reviewed: l.reviewed,
      }));
    }),

  submit: publicProcedure
    .input(factorsSchema.extend({
      lineItemId: uuidSchema,
      ratings: ratingsSchema,
      body: z.string().trim().max(REVIEW_BODY_MAX, OBJECTION_COPY.body_too_long).nullish(),
      /**
       * Doc 06 §10: reviews disclose incentives, samples or promotional
       * consideration. Asked rather than inferred — we cannot detect it, and a
       * field that is never true is a field that was never asked.
       */
      incentiveDisclosed: z.boolean().default(false),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      limit('aftercare', input.phone);

      const body = input.body ?? null;

      // The domain decides, and reports EVERY objection. Zod has already
      // refused the malformed shapes; this catches the ones that are about
      // meaning rather than type.
      const objections = objectionsToReview({ ratings: input.ratings, body });
      if (objections.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: objections.map((o) => OBJECTION_COPY[o]).join(' · '),
        });
      }

      const reference = normaliseOrderReference(input.reference);
      if (!reference) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد طلب مطابق' });
      }

      const recorded = await ctx.aftercareUow.transaction((r) => r.reviews.record({
        reference,
        phone: input.phone,
        lineItemId: input.lineItemId,
        ratings: input.ratings,
        body,
        incentiveDisclosed: input.incentiveDisclosed,
        now: ctx.clock.now(),
      }));

      /*
       * ONE message for every refusal.
       *
       * "Not your order", "not delivered yet" and "already reviewed" are three
       * different facts, and telling them apart would let somebody holding a
       * leaked reference learn which line items exist and which have been
       * reviewed. The customer who legitimately hits this is looking at a
       * screen that already told them the answer.
       */
      if (!recorded) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'لا يمكن تقييم هذا المنتج الآن',
        });
      }

      return { id: recorded.id, productSlug: recorded.productSlug };
    }),

  /** A product's reviews, for the product page. Public. */
  forProduct: publicProcedure
    .input(z.object({ productId: uuidSchema, limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const [reviews, summary] = await ctx.uow.transaction(async (r) => [
        await r.reviews.listForProduct({ productId: input.productId, limit: input.limit }),
        await r.reviews.summaryFor(input.productId),
      ] as const);

      return {
        summary: summaryOut(summary),
        reviews: reviews.map((review) => ({
          id: review.id,
          ratings: review.ratings,
          body: review.body,
          authorName: review.authorName,
          createdAt: review.createdAt.toISOString(),
        })),
      };
    }),

  /**
   * Ratings for a grid of products, in one read.
   *
   * The tiles ask together rather than one at a time: a rating on every tile of
   * the catalogue is an N+1 on the busiest page of the site.
   */
  summaries: publicProcedure
    .input(z.object({ productIds: z.array(uuidSchema).max(60) }))
    .query(async ({ ctx, input }) => {
      const map = await ctx.uow.transaction((r) => r.reviews.summariesFor(input.productIds));
      // Filled in for every id asked about, so the caller never has to decide
      // what a missing key means.
      return Object.fromEntries(
        input.productIds.map((id) => [id, summaryOut(map.get(id) ?? EMPTY_SUMMARY)]),
      );
    }),

  /* ------------------------------------------------------------ moderation */

  queue: platformProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.uow.transaction((r) =>
        r.reviews.listForModeration({ limit: input?.limit ?? 100 }));

      return rows.map((row) => ({
        id: row.id,
        ratings: row.ratings,
        body: row.body,
        authorName: row.authorName,
        createdAt: row.createdAt.toISOString(),
        productId: row.productId,
        productSlug: row.productSlug,
        productName: row.productName,
        brandName: row.brandName,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        moderationNote: row.moderationNote,
      }));
    }),

  /**
   * Hide a review, with the reason written down.
   *
   * Doc 06 §10: moderation removes abuse, not criticism. Nothing enforces that
   * sentence by reading the review — what enforces it is that the note is
   * required, that only the platform can do this, that nothing deletes the row,
   * and that the decision lands in the audit trail in the same transaction.
   */
  hide: platformProcedure
    .input(z.object({ id: uuidSchema, note: z.string().trim().min(1, 'اكتب سبب الإخفاء').max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }
      if (objectionsToHiding(input.note).length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'اكتب سبب الإخفاء' });
      }
      const staffId = ctx.platformStaffId;

      return ctx.uow.transaction(async (r) => {
        const hidden = await r.reviews.hide({
          id: input.id, note: input.note, moderatorId: staffId, now: ctx.clock.now(),
        });
        if (!hidden) {
          throw new TRPCError({ code: 'CONFLICT', message: 'التقييم مخفي بالفعل أو غير موجود' });
        }

        // In the SAME transaction as the decision. A hiding that committed
        // while its audit entry failed is criticism removed with nobody
        // accountable for removing it.
        await r.audit.record({
          action: 'review_moderation',
          actorId: staffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'reviews',
          entityId: input.id,
          before: JSON.stringify({ hidden: false }),
          after: JSON.stringify({ hidden: true, note: input.note }),
        });

        return { hidden: true };
      });
    }),

  restore: platformProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
      }
      const staffId = ctx.platformStaffId;

      return ctx.uow.transaction(async (r) => {
        const restored = await r.reviews.restore({
          id: input.id, moderatorId: staffId, now: ctx.clock.now(),
        });
        if (!restored) {
          throw new TRPCError({ code: 'CONFLICT', message: 'التقييم ظاهر بالفعل أو غير موجود' });
        }

        // Reversing a decision is a decision. It is recorded exactly as the
        // original was, or the log tells half a story.
        await r.audit.record({
          action: 'review_moderation',
          actorId: staffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'reviews',
          entityId: input.id,
          before: JSON.stringify({ hidden: true }),
          after: JSON.stringify({ hidden: false }),
        });

        return { hidden: false };
      });
    }),
});
