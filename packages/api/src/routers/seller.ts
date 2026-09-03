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
    const entries = await ctx.uow.transaction((r) =>
      r.subOrders.listQueueForSeller(ctx.sellerId!));

    // Soonest deadline first. A queue sorted by arrival looks tidier and buries
    // the order that is about to breach its confirmation SLA behind five that
    // are not — which is the only ordering that actually costs money.
    return [...entries]
      .sort((a, b) => {
        const left = a.confirmDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const right = b.confirmDueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return left - right;
      })
      .map((s) => ({
        id: s.id,
        reference: s.reference,
        state: s.state,
        merchandisePiastres: s.merchandise.minor,
        shippingPiastres: s.shipping.minor,
        placedAt: s.placedAt.toISOString(),
        confirmDueAt: s.confirmDueAt?.toISOString() ?? null,
        recipient: {
          name: s.recipientName,
          phone: s.recipientPhone,
          governorate: s.governorate,
          city: s.city,
          area: s.area,
          street: s.street,
          building: s.building,
          floor: s.floor,
          apartment: s.apartment,
          landmark: s.landmark,
        },
        items: s.items.map((i) => ({
          name: i.name, sku: i.sku, volumeMl: i.volumeMl, quantity: i.quantity,
        })),
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
