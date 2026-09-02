/**
 * Seller portal.
 *
 * The order queue is the most time-critical surface in the product, so these
 * procedures stay thin: the state machine decides what is legal, the repository
 * writes it, and the database refuses anything the first two let through.
 */
import { SubOrderLifecycle } from '@diyar/domain';
import { router, sellerProcedure } from '../trpc';
import { confirmSchema, declineSchema } from '../validation';

export const sellerRouter = router({
  /**
   * The caller's own queue. No sellerId is accepted as input — it comes from the
   * session, so a crafted request cannot ask for another house's orders. RLS
   * would refuse anyway; this makes it impossible to even express.
   */
  queue: sellerProcedure.query(async ({ ctx }) => {
    const subs = await ctx.uow.transaction((r) => r.subOrders.listBySeller(ctx.sellerId!));
    return subs.map((s) => ({
      id: s.id,
      reference: s.reference,
      state: s.state,
      merchandisePiastres: s.merchandise.minor,
      shippingPiastres: s.shipping.minor,
    }));
  }),

  confirm: sellerProcedure
    .input(confirmSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const sub = await r.subOrders.findById(input.subOrderId);
        if (!sub) return { ok: false as const };

        const record = SubOrderLifecycle.transition(
          sub.state, { to: 'confirmed', actor: 'seller' }, ctx.clock,
        );
        await r.subOrders.applyTransition(sub.id, 'confirmed', 'seller', null, record);
        return { ok: true as const, state: 'confirmed' as const };
      });
    }),

  decline: sellerProcedure
    .input(declineSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const sub = await r.subOrders.findById(input.subOrderId);
        if (!sub) return { ok: false as const };

        // The reason is required by the schema AND by the state machine. Doc 06
        // §7: cost has to be allocated to a documented party.
        const record = SubOrderLifecycle.transition(
          sub.state, { to: 'rejected', actor: 'seller', reason: input.reason }, ctx.clock,
        );
        await r.subOrders.applyTransition(sub.id, 'rejected', 'seller', input.reason, record);
        return { ok: true as const, state: 'rejected' as const };
      });
    }),
});
