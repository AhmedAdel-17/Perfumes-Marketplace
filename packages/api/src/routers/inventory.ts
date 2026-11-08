import { z } from 'zod';
import { INVENTORY_ADJUSTMENT_REASONS } from '@diyar/domain';
import { router, sellerProcedure } from '../trpc';

/** Facade: tenant comes only from the authenticated session. The client supplies
 * an expected quantity and stable request ID so retries never apply twice. */
export const inventoryRouter = router({
  stock: sellerProcedure.input(z.object({ productId: z.string().uuid() }).strict())
    .query(({ ctx, input }) => ctx.uow.transaction(r => r.inventory.summary(input.productId))),
  movements: sellerProcedure.input(z.object({ productId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(50) }).strict())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.uow.transaction(r => r.inventory.movements(input.productId, input.limit));
      return rows.map(row => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
    }),
  adjust: sellerProcedure.input(z.object({ productId: z.string().uuid(), requestId: z.string().uuid(),
    expectedOnHand: z.number().int().min(0).max(100000), delta: z.number().int().min(-100000).max(100000).refine(n => n !== 0),
    reason: z.enum(INVENTORY_ADJUSTMENT_REASONS),
  }).strict()).mutation(({ ctx, input }) => ctx.uow.transaction(r => r.inventory.adjust({ ...input, occurredAt: ctx.clock.now() }))),
});
