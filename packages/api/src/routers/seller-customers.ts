/** Facade: owner-only customer names and own-house completed history. */
import { z } from 'zod';
import { router, sellerProcedure } from '../trpc';
import type { SellerCustomerSummary } from '@diyar/domain';
const summary = (row: SellerCustomerSummary) => ({ customerRef: row.customerRef, fullName: row.fullName,
  completedOrders: row.completedOrders, firstDeliveredAt: row.firstDeliveredAt.toISOString(),
  lastDeliveredAt: row.lastDeliveredAt.toISOString() });
const limit = z.number().int().min(1).max(50).default(20);
export const sellerCustomersRouter = router({
  leaderboard: sellerProcedure
    .input(z.object({ limit }).strict().optional())
    .query(async ({ ctx, input }) => {
      const result = await ctx.uow.transaction(r => r.sellerCustomers.leaderboard({ limit: input?.limit ?? 20 }));
      if (result.access === 'restricted') return { access: 'restricted' as const };
      return { access: 'owner' as const, ranking: 'completed_order_count' as const, period: 'all_time' as const,
        excludesAnyRecordedReturn: true as const, customers: result.customers.map(summary) };
    }),
  profile: sellerProcedure
    .input(z.object({ customerRef: z.string().regex(/^C-[a-f0-9]{32}$/), limit }).strict())
    .query(async ({ ctx, input }) => {
      const result = await ctx.uow.transaction(r => r.sellerCustomers.profile(input));
      if (result.access === 'restricted') return { access: 'restricted' as const };
      return { access: 'owner' as const, profile: result.profile ? { ...summary(result.profile),
        orders: result.profile.orders.map(row => ({ reference: row.reference, deliveredAt: row.deliveredAt.toISOString() })) } : null };
    }),
});
