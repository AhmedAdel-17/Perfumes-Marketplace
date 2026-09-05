import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  isUsableSlug, movePage, nextStates, objectionsToPublishing, PAGE_STATES,
  type ContentRole, type PublishObjection,
} from '@diyar/domain';
import { platformProcedure, publicProcedure, router } from '../trpc';
import { blocksSchema, pageTitleSchema } from '../content-validation';

/**
 * Editorial content.
 *
 * A facade, like every router here: it validates, authorises, asks the domain
 * whether the move is legal, and persists. The publishing rules live in
 * `@diyar/domain/content`.
 *
 * TWO AUDIENCES, AND THEY DO NOT SHARE A PROCEDURE. `read` and `directory` are
 * public and can only ever return a frozen published revision. Everything else
 * is platform-only. A single procedure with a `draft` flag would be one
 * forgotten argument away from serving an unfinished page to the internet, and
 * that argument would be supplied by a caller rather than by a policy.
 */

/**
 * The content role a platform staff member acts with.
 *
 * `platform_staff.role` is deliberately coarse (migration 0007) — inventing a
 * permission matrix before anyone has done the job would be guessing — so the
 * mapping is stated here, in one place, rather than assumed at each call site.
 * An admin publishes; everyone else drafts and submits for review.
 *
 * When the platform roles are refined, this function is what changes.
 */
function contentRoleFor(staffRole: string | null): ContentRole {
  return staffRole === 'admin' ? 'publisher' : 'editor';
}

/** The signed-in operator, or a refusal. Publishing has to be attributable. */
function staffOrThrow(ctx: { platformStaffId: string | null }): string {
  if (!ctx.platformStaffId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      // A revision records who published it, and the column is NOT NULL: a
      // revision nobody can be asked about is a revision nobody owns.
      message: 'لا يمكن النشر دون تسجيل دخول',
    });
  }
  return ctx.platformStaffId;
}

export const contentRouter = router({
  /** What a visitor is served. Never a draft, by construction. */
  read: publicProcedure
    .input(z.object({ slug: z.string().trim().max(80) }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.uow.transaction((r) => r.content.findLive(input.slug));
      if (!page) return null;
      return {
        slug: page.slug,
        title: page.title,
        blocks: page.blocks,
        publishedAt: page.publishedAt.toISOString(),
      };
    }),

  /** Every live page — for the footer and the sitemap. */
  directory: publicProcedure.query(async ({ ctx }) =>
    ctx.uow.transaction((r) => r.content.listLive())),

  /* ----------------------------------------------------------- the console */

  list: platformProcedure.query(async ({ ctx }) => {
    const pages = await ctx.uow.transaction((r) => r.content.list());
    const role = contentRoleFor(ctx.platformRole);

    return pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      state: page.state,
      isLive: page.publishedRevisionId !== null && page.state !== 'archived',
      /*
       * The moves THIS operator may make, computed on the server.
       *
       * The console could work them out from the state, and then the rule would
       * exist twice and one copy would be a screen. Sending the answer means a
       * button that is offered is a button that will work — which is the whole
       * complaint about the decline reason that rendered and did nothing.
       */
      canMoveTo: nextStates(page.state, role),
    }));
  }),

  get: platformProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.uow.transaction((r) => r.content.findById(input.id));
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });

      const role = contentRoleFor(ctx.platformRole);
      return {
        id: page.id,
        slug: page.slug,
        title: page.title,
        state: page.state,
        // Whether a visitor can reach it, which is NOT `state === 'published'`
        // — a published page pulled back to draft is still on the site.
        isLive: page.publishedRevisionId !== null && page.state !== 'archived',
        blocks: page.draftBlocks,
        canMoveTo: nextStates(page.state, role),
        // Shown while editing, so an editor learns what will block publishing
        // before they ask to publish rather than after.
        objections: objectionsToPublishing(page.draftBlocks),
      };
    }),

  create: platformProcedure
    .input(z.object({ slug: z.string().trim().max(80), title: pageTitleSchema }))
    .mutation(async ({ ctx, input }) => {
      // The slug rule lives in the domain — it knows which paths the site
      // already owns, which is a fact about routes rather than about data.
      if (!isUsableSlug(input.slug)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'معرّف الصفحة غير صالح أو محجوز' });
      }

      return ctx.uow.transaction(async (r) => {
        const clash = await r.content.findBySlug(input.slug);
        if (clash) {
          throw new TRPCError({ code: 'CONFLICT', message: 'يوجد صفحة بهذا المعرّف' });
        }
        const page = await r.content.create(input);
        return { id: page.id };
      });
    }),

  saveDraft: platformProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: pageTitleSchema,
      blocks: blocksSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.uow.transaction(async (r) => {
        const page = await r.content.findById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
        await r.content.saveDraft(input.id, { title: input.title, blocks: input.blocks });
      });

      // Returned so the console can show what still stands between this draft
      // and being publishable, without a second round trip.
      return { objections: objectionsToPublishing(input.blocks) };
    }),

  move: platformProcedure
    .input(z.object({
      id: z.string().uuid(),
      to: z.enum(PAGE_STATES),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = contentRoleFor(ctx.platformRole);

      return ctx.uow.transaction(async (r) => {
        const page = await r.content.findById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });

        // The domain decides. An illegal move or the wrong role throws and is
        // mapped to Arabic by the error middleware; content that is not ready
        // comes back as objections, because that is an editor's ordinary
        // working state and not an error.
        const result = movePage(page, input.to, role, ctx.clock);
        if ('objections' in result) {
          return {
            objections: result.objections,
            // Nothing moved, so the page can still do exactly what it could.
            state: page.state,
            canMoveTo: nextStates(page.state, role),
          };
        }

        if (result.moved.publishes) {
          await r.content.publish(input.id, staffOrThrow(ctx));
        } else {
          await r.content.setState(input.id, input.to);
        }

        /*
         * Doc 04 §8: "Privacy, terms, seller agreement, return policy ... are
         * live" is a gate, and those pages live here. Changing what the terms
         * say is a policy change, so who published which version and when has
         * to be answerable — the revision itself records the text, and this
         * records the decision to serve it.
         */
        await r.audit.record({
          action: 'policy_change',
          actorId: ctx.platformStaffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'content_pages',
          entityId: input.id,
          before: JSON.stringify({ state: page.state }),
          after: JSON.stringify({ state: input.to, slug: page.slug }),
        });

        /*
         * The moves available FROM THE NEW STATE, answered here.
         *
         * The console needs them the instant a move succeeds, and the
         * alternative was for it to work them out — which would put the
         * transition table in a screen as well as in the domain. One of the two
         * copies would eventually be wrong, and it would be the screen: a
         * button offered that does nothing, which is the exact defect the
         * seller portal already shipped once.
         */
        return {
          objections: [] as PublishObjection[],
          state: input.to,
          canMoveTo: nextStates(input.to, role),
        };
      });
    }),

  history: platformProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const page = await r.content.findById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });

        const revisions = await r.content.revisions(input.id);
        return revisions.map((rev) => ({
          id: rev.id,
          title: rev.title,
          publishedAt: rev.publishedAt.toISOString(),
          blockCount: rev.blocks.length,
          // Which one the site is serving right now. Without it the history is
          // a list of dates and an operator has to infer "current" from the
          // top row — which is wrong the moment a page is rolled back.
          isServing: rev.id === page.publishedRevisionId,
        }));
      });
    }),

  /**
   * The draft, rendered.
   *
   * Platform-only, and a separate procedure from `read` rather than a flag on
   * it — the same reasoning as everywhere else in this router. A signed preview
   * link would be the other option and it is worse: links get forwarded, and a
   * link that shows unpublished content is a link that leaks it the first time
   * someone is helpful.
   */
  preview: platformProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.uow.transaction((r) => r.content.findById(input.id));
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      return {
        slug: page.slug,
        title: page.title,
        blocks: page.draftBlocks,
        state: page.state,
      };
    }),

  restore: platformProcedure
    .input(z.object({ id: z.string().uuid(), revisionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const revision = await r.content.restore(input.id, input.revisionId);
        if (!revision) {
          // Covers both "no such revision" and "belongs to another page", and
          // says the same thing for each: a distinction here would tell a
          // caller which revision ids exist elsewhere.
          throw new TRPCError({ code: 'NOT_FOUND', message: 'النسخة غير موجودة' });
        }

        /*
         * Restoring does NOT publish, and does not move the page's state.
         *
         * It loads the old text into the draft and stops. Anything else would
         * let one press put content back on the site with no review — the
         * property publishing exists to provide, undone by an undo button.
         */
        return {
          title: revision.title,
          blocks: revision.blocks,
          publishedAt: revision.publishedAt.toISOString(),
        };
      });
    }),
});
