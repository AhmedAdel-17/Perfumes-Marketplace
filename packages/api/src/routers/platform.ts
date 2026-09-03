import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  generateOrderReference,
  SettlementService,
  SubOrderLifecycle,
} from '@diyar/domain';
import { platformProcedure, router } from '../trpc';

/**
 * Operations.
 *
 * Everything here is platform-only, and the reason is the same in each case:
 * these are the actions a HOUSE must not be able to take about its own money.
 *
 * A house cannot mark its own order delivered — that would let it start its own
 * reserve clock and trigger its own payout on its own say-so. It cannot record
 * that cash was remitted, because the cash comes from the courier and the house
 * is the party being paid. The state machine already refuses `seller` on the
 * delivery transition; these procedures are the second lock on the same door.
 *
 * When the courier integration lands, `markDelivered` and `recordRemittance`
 * become webhook handlers rather than buttons. Nothing else changes: the
 * authority moves from an operator to a courier, and neither of them is the
 * house.
 */
export const platformRouter = router({
  /**
   * What is waiting on an operator.
   *
   * Two things stall an order once it has left a house, and both block the
   * house getting paid: a parcel nobody has confirmed arrived, and cash nobody
   * has recorded arriving. Everything else belongs to the house or to nobody,
   * so it is not here — a console listing every order is a console nobody
   * reads, and the point of this screen is that its emptiness is meaningful.
   */
  workQueue: platformProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.subOrders.listOpsQueue());
    return rows.map((s) => ({
      id: s.id,
      reference: s.reference,
      state: s.state,
      sellerId: s.sellerId,
      brandName: s.brandName,
      recipientName: s.recipientName,
      totalPiastres: s.total.minor,
      dispatchedAt: s.dispatchedAt?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      trackingNumber: s.trackingNumber,
      remitted: s.remitted,
      // The one thing an operator needs told, rather than worked out.
      needs: s.state === 'dispatched' ? ('delivery' as const) : ('remittance' as const),
    }));
  }),

  markDelivered: platformProcedure
    .input(z.object({ subOrderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const sub = await r.subOrders.findById(input.subOrderId);
        if (!sub) return { ok: false as const };

        const record = SubOrderLifecycle.transition(
          sub.state, { to: 'delivered', actor: 'platform' }, ctx.clock,
        );
        await r.subOrders.applyTransition(sub.id, 'delivered', 'platform', null, record);
        return { ok: true as const, state: 'delivered' as const };
      });
    }),

  /**
   * The courier handed over the cash.
   *
   * Deliberately NOT implied by delivery. A parcel arriving and the money
   * arriving are separate events days apart, and settlement waits on the
   * second — "never pay faster than you are paid" (doc 03 §10). Collapsing them
   * would pay houses for cash the marketplace does not yet hold.
   */
  recordRemittance: platformProcedure
    .input(z.object({
      subOrderId: z.string().uuid(),
      collectedPiastres: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.uow.transaction((r) => r.subOrders.recordRemittance({
        subOrderId: input.subOrderId,
        collectedPiastres: input.collectedPiastres,
        remittedAt: ctx.clock.now(),
      }));
      return { ok: true as const };
    }),

  /**
   * Run a payout for one house.
   *
   * The arithmetic is entirely `SettlementService` — this reads rows, hands
   * them over, and writes what comes back. No rule about what settles lives
   * here, because a settlement rule in a router is a rule with no unit test.
   *
   * The statement is verified to reconcile BEFORE it is written. A payout whose
   * lines do not add up to its own total is the single most expensive bug this
   * product could have: it destroys the seller trust the entire commission
   * model rests on, and it does so quietly.
   */
  runPayout: platformProcedure
    .input(z.object({
      sellerId: z.string().uuid(),
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const seller = await r.sellers.findById(input.sellerId);
        if (!seller) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدار غير موجودة' });

        const subOrders = await r.subOrders.listForSettlement(input.sellerId);

        const statement = new SettlementService(ctx.clock).build({
          sellerId: input.sellerId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          subOrders,
          adjustments: [],
          reserveDays: seller.payoutReserveDays,
          disputeWindowDays: seller.disputeWindowDays,
        });

        if (!SettlementService.reconciles(statement)) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'تعذّر إصدار كشف الحساب',
          });
        }

        const saved = await r.payouts.save({
          sellerId: input.sellerId,
          reference: generateOrderReference((n) => crypto.getRandomValues(new Uint8Array(n)))
            .replace('DY-', 'PO-'),
          statement,
        });

        return {
          payoutId: saved.id,
          reference: saved.reference,
          netPiastres: statement.net.minor,
          grossPiastres: statement.gross.minor,
          commissionPiastres: statement.commission.minor,
          heldGrossPiastres: statement.heldGross.minor,
          lineCount: statement.lines.length,
        };
      });
    }),
});
