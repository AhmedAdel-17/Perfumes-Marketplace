import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { NOTE_ICONS } from '@diyar/domain';
import { platformProcedure, router } from '../trpc';

/**
 * The notes glossary, for the console (D-3; migration 0030).
 *
 * Platform-only, like the table's write policy: a house naming its own notes
 * in English would be the per-product translation the glossary replaces.
 * Every change is audited — it is what the whole English storefront prints
 * beside every perfume that carries the note.
 */
const note = z.string().trim().min(1).max(40);

export const glossaryRouter = router({
  entries: platformProcedure.query(async ({ ctx }) =>
    ctx.uow.transaction((r) => r.glossary.entries())),

  set: platformProcedure
    // `icon` left out keeps the note's drawing; null clears it.
    .input(z.object({ ar: note, en: note, icon: z.enum(NOTE_ICONS).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const staff = ctx.platformStaffId;
      if (!staff) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة.' });

      return ctx.uow.transaction(async (r) => {
        const { before, beforeIcon } = await r.glossary.set(input.ar, input.en, staff, input.icon);
        // Left out, the drawing was kept — so the entry still has the old one.
        const afterIcon = input.icon === undefined ? beforeIcon : input.icon;
        await r.audit.record({
          action: 'policy_change',
          actorId: staff,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'note_glossary',
          // The key is the note itself, not a uuid, so it travels in the body.
          entityId: null,
          before: before === null ? null : JSON.stringify({ ar: input.ar, en: before, icon: beforeIcon }),
          after: JSON.stringify({ ar: input.ar, en: input.en, icon: afterIcon }),
        });
        return { ar: input.ar, en: input.en };
      });
    }),

  remove: platformProcedure
    .input(z.object({ ar: note }))
    .mutation(async ({ ctx, input }) => {
      const staff = ctx.platformStaffId;
      if (!staff) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة.' });

      return ctx.uow.transaction(async (r) => {
        const removed = await r.glossary.remove(input.ar);
        if (removed) {
          await r.audit.record({
            action: 'policy_change',
            actorId: staff,
            actorLabel: ctx.platformLabel ?? 'platform',
            entityTable: 'note_glossary',
            entityId: null,
            before: JSON.stringify({ ar: input.ar }),
            after: null,
          });
        }
        return { removed };
      });
    }),
});
