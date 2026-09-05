import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  ANNOUNCEMENT_MAX_LENGTH, isInternalPath, objectionsToPosting, showing,
} from '@diyar/domain';
import { platformProcedure, publicProcedure, router } from '../trpc';

/**
 * Site-level content: the announcement bar, and what opens the homepage.
 *
 * The public procedures return only what is CURRENTLY true. A scheduled
 * announcement never crosses this boundary — the repository filters by window
 * and the RLS policy filters by window, and the console reads through a
 * different procedure entirely.
 */

/** The message an operator sees for each reason a notice was refused. */
const OBJECTION_TEXT: Record<string, string> = {
  empty_message: 'اكتب نص الإعلان.',
  message_too_long: `النص أطول من ${ANNOUNCEMENT_MAX_LENGTH} حرفًا.`,
  ends_before_it_starts: 'تاريخ الانتهاء قبل تاريخ البدء.',
  window_too_long: 'المدة أطول من ثلاثة أشهر. ما يدوم أكثر من ذلك يستحق صفحة، لا شريطًا.',
  already_over: 'المدة انتهت بالفعل. راجع السنة في التاريخ.',
};

export const siteRouter = router({
  /**
   * The one notice a visitor should see, or null.
   *
   * The domain picks it — most recently begun wins — rather than this router
   * taking the first row and hoping the ORDER BY agrees. The contract test
   * holds the repository's ordering to the same rule, so the two cannot drift.
   */
  announcement: publicProcedure.query(async ({ ctx }) => {
    const now = ctx.clock.now();
    const live = await ctx.uow.transaction((r) => r.site.currentAnnouncements(now));
    const current = showing(live, now);
    if (!current) return null;
    return { id: current.id, message: current.message, href: current.href };
  }),

  curation: publicProcedure.query(async ({ ctx }) =>
    ctx.uow.transaction((r) => r.site.curation())),

  /* ----------------------------------------------------------- the console */

  announcements: platformProcedure.query(async ({ ctx }) => {
    const now = ctx.clock.now();
    const all = await ctx.uow.transaction((r) => r.site.allAnnouncements());
    const current = showing(
      all.filter((a) => now >= a.startsAt && now < a.endsAt),
      now,
    );

    return all.map((a) => ({
      id: a.id,
      message: a.message,
      href: a.href,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      /*
       * Three states, not two, and the distinction is the point.
       *
       * `showing` is the one visitors actually see. `live` is in window but
       * covered by a newer one — an operator who could not tell those apart
       * would post a notice, see it listed as live, and never learn why nobody
       * mentioned it.
       */
      isShowing: current?.id === a.id,
      isLive: now >= a.startsAt && now < a.endsAt,
      hasEnded: now >= a.endsAt,
    }));
  }),

  post: platformProcedure
    .input(z.object({
      message: z.string().trim().min(1).max(ANNOUNCEMENT_MAX_LENGTH),
      href: z.string().nullable(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة.' });
      }
      if (input.href !== null && !isInternalPath(input.href)) {
        // Same rule as the content blocks, and it matters more here: this link
        // appears on EVERY page of the site.
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'الروابط الخارجية غير مسموح بها' });
      }

      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      const objections = objectionsToPosting(
        { message: input.message, startsAt, endsAt }, ctx.clock.now(),
      );
      if (objections.length > 0) {
        return { posted: false, objections: objections.map((o) => OBJECTION_TEXT[o] ?? o) };
      }

      await ctx.uow.transaction((r) => r.site.post({
        message: input.message.trim(),
        href: input.href,
        startsAt,
        endsAt,
        createdBy: ctx.platformStaffId!,
      }));
      return { posted: true, objections: [] as string[] };
    }),

  endAnnouncement: platformProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ended = await ctx.uow.transaction(
        (r) => r.site.endAnnouncement(input.id, ctx.clock.now()),
      );
      if (!ended) {
        // Covers "already over" and "has not started". Neither is an error the
        // operator caused, and both mean the same thing on screen: there was
        // nothing showing to take down.
        return { ended: false, message: 'لا يوجد إعلان معروض لإيقافه.' };
      }
      return { ended: true };
    }),

  setCuration: platformProcedure
    .input(z.object({
      heroProductId: z.string().uuid().nullable(),
      featuredProductIds: z.array(z.string().uuid()).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.platformStaffId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة.' });
      }

      return ctx.uow.transaction(async (r) => {
        /*
         * Every id has to be a PUBLISHED product.
         *
         * Curating a draft would put an unpublished listing at the top of the
         * homepage — the one place on the site where a broken link costs the
         * most — and the failure would present as a 404 on the front door
         * rather than as a bad setting.
         */
        const wanted = [input.heroProductId, ...input.featuredProductIds]
          .filter((id): id is string => id !== null);

        // `snapshotForCart` is the checkout's own guard: it returns only what
        // is genuinely sellable — published listing AND a live house. Reusing
        // it means curation cannot feature something the shop would refuse to
        // sell, and there is one definition of sellable rather than two.
        const sellable = wanted.length === 0
          ? []
          : await r.products.snapshotForCart(wanted);
        const known = new Set(sellable.map((p) => p.productId));
        const unknown = wanted.filter((id) => !known.has(id));

        if (unknown.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'لا يمكن اختيار منتج غير منشور',
          });
        }

        await r.site.setCuration({
          heroProductId: input.heroProductId,
          featuredProductIds: input.featuredProductIds,
          updatedBy: ctx.platformStaffId!,
        });
        return { ok: true };
      });
    }),
});
