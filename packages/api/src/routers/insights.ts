import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { buildOwnerReport, cairoPeriod, type Money, type Rate } from '@diyar/domain';
import { platformProcedure, router } from '../trpc';

/**
 * What the owner sees — doc 04 §8 gate 8, "without database work".
 *
 * A FACADE, as every router is: one read through the port, one pure projection
 * (`buildOwnerReport`), and serialisation. No figure is computed here, because
 * a figure computed in a router is a figure with no unit test and a second
 * definition waiting to drift from `docs/ANALYTICS_DEFINITIONS.md`.
 *
 * ADMIN ONLY, not every operator. Platform revenue and take rate are the
 * business's own margin; an operator working the delivery queue needs neither,
 * and least privilege (CLAUDE.md §8) is not suspended for internal staff.
 *
 * SERIALISED TO FACTS, NOT PRESENTATION. Money leaves as piastres, rates as a
 * numerator and a denominator, unrecorded inputs with a null amount. The screen
 * decides how a rate over zero orders reads; the API never turns it into "0%".
 */

const PERIODS = [1, 7, 30, 90] as const;

const money = (m: Money) => m.minor;
const rate = (r: Rate) => ({ numerator: r.numerator, denominator: r.denominator });

export const insightsRouter = router({
  owner: platformProcedure
    .input(z.object({
      days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(30),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.platformRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'هذه الصفحة لإدارة المنصّة فقط' });
      }

      const asOf = ctx.clock.now();
      const period = cairoPeriod(asOf, input.days);

      const { facts, houseNames, browsing } = await ctx.uow.transaction(async (r) => {
        const found = await r.ownerReport.facts(period);
        const names = new Map<string, string>();
        for (const sellerId of new Set(found.subOrders.map((s) => s.sellerId))) {
          const house = await r.sellers.findById(sellerId);
          names.set(sellerId, house?.tradingName ?? '—');
        }
        // The same period, read in the same transaction as the orders it is
        // shown beside — two reads a moment apart could disagree across a
        // midnight boundary.
        return { facts: found, houseNames: names, browsing: await r.analytics.countsInPeriod(period.from, period.to) };
      });

      const report = buildOwnerReport({ ...facts, browsing, asOf });

      return {
        days: input.days,
        periods: PERIODS,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        preOrder: report.preOrder,
        funnel: report.funnel,
        sla: report.sla.map((s) => ({
          sellerId: s.sellerId,
          houseName: houseNames.get(s.sellerId) ?? '—',
          placed: s.placed,
          answeredOnTime: rate(s.answeredOnTime),
          unansweredPastDeadline: s.unansweredPastDeadline,
          medianMinutesToAnswer: s.medianMinutesToAnswer,
          dispatchedOnTime: rate(s.dispatchedOnTime),
          unshippedPastDeadline: s.unshippedPastDeadline,
          rejection: rate(s.rejection),
          refusal: rate(s.refusal),
          returns: rate(s.returns),
        })),
        refusalByGovernorate: Object.entries(report.refusalByGovernorate)
          .map(([governorate, r]) => ({ governorate, ...rate(r) }))
          .sort((a, b) => b.denominator - a.denominator),
        gmvPiastres: money(report.gmv),
        heldGmvPiastres: money(report.heldGmv),
        platformRevenuePiastres: money(report.platformRevenue),
        effectiveTakeRateBps: report.effectiveTakeRateBps,
        completedOrders: report.completedOrders,
        aovPiastres: report.aov === null ? null : money(report.aov),
        sourceMix: report.sourceMix.map((m) => ({
          source: m.source, gmvPiastres: money(m.gmv), subOrders: m.subOrders,
        })),
        contributionInputs: report.contributionInputs.map((i) => ({
          key: i.key,
          status: i.status,
          amountPiastres: i.amount === null ? null : money(i.amount),
          count: i.count,
        })),
      };
    }),
});
