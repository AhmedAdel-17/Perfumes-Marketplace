import { z } from 'zod';
import { AUDIT_ACTIONS, type AuditRecord } from '@diyar/domain';
import { platformProcedure, router } from '../trpc';
import { uuidSchema } from '../validation';

/**
 * Reading the audit trail.
 *
 * Doc 04 §8 gate 6 has two halves: decisions are RECORDED, and somebody can
 * READ them without database work. The first half has been true since the
 * trail was wired into every money and moderation decision; until this router
 * the second half meant opening a SQL client, which is to say it was not true.
 *
 * Platform-only twice over: the procedure refuses anyone else, and migration
 * 0002 gives no other role a policy on `audit_log`, so a house reaching this
 * procedure by some future mistake would still read an empty table.
 *
 * READ-ONLY, deliberately and permanently. There is no procedure here that
 * writes, and there must never be one: entries are written by the decision
 * they record, inside its transaction, and the table refuses UPDATE and DELETE
 * at the database. A console that could annotate an entry after the fact would
 * be a console for rewriting what happened.
 */

const PAGE_MAX = 100;

const entryOut = (row: AuditRecord) => ({
  id: row.id,
  action: row.action,
  actorLabel: row.actorLabel,
  entityTable: row.entityTable,
  before: row.before ?? null,
  after: row.after ?? null,
  note: row.note ?? null,
  occurredAt: row.occurredAt.toISOString(),
});

export const auditRouter = router({
  recent: platformProcedure
    .input(z.object({
      action: z.enum(AUDIT_ACTIONS).optional(),
      /** The id of the last entry on the previous page. */
      before: uuidSchema.optional(),
      limit: z.number().int().min(1).max(PAGE_MAX).default(50),
    }))
    .query(async ({ ctx, input }) => {
      /*
       * One more than the page, to know whether there IS a next page.
       *
       * The alternative is offering "older" whenever a page is full, which on
       * a trail whose length is an exact multiple of the page size leads the
       * operator to an empty screen — and an empty audit screen reads as
       * "nothing happened", which is the one thing it must never say falsely.
       */
      const rows = await ctx.uow.transaction((r) => r.audit.recent({
        ...(input.action === undefined ? {} : { action: input.action }),
        ...(input.before === undefined ? {} : { before: input.before }),
        limit: input.limit + 1,
      }));

      const page = rows.slice(0, input.limit);
      const last = page[page.length - 1];
      return {
        entries: page.map(entryOut),
        nextBefore: rows.length > input.limit && last ? last.id : null,
      };
    }),
});
