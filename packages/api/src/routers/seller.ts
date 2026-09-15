/**
 * Seller portal.
 *
 * The order queue is the most time-critical surface in the product, so these
 * procedures stay thin: the state machine decides what is legal, the repository
 * writes it, and the database refuses anything the first two let through.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { SubOrderLifecycle } from '@diyar/domain';
import { manualCourier, TRACKING_MAX, TRACKING_MIN } from '../providers/courier';
import { router, sellerProcedure } from '../trpc';
import { confirmSchema, declineSchema } from '../validation';

export const sellerRouter = router({
  /**
   * The caller's own queue. No sellerId is accepted as input — it comes from the
   * session, so a crafted request cannot ask for another house's orders. RLS
   * would refuse anyway; this makes it impossible to even express.
   */
  queue: sellerProcedure.query(async ({ ctx }) => {
    const { entries, shipments } = await ctx.uow.transaction(async (r) => {
      const rows = await r.subOrders.listQueueForSeller(ctx.sellerId!);
      // One lookup per dispatched row rather than for the whole queue: most
      // rows are not dispatched and have no parcel to describe.
      const found = new Map<string, string | null>();
      for (const row of rows) {
        if (row.state !== 'dispatched' && row.state !== 'delivered') continue;
        const shipment = await r.subOrders.findShipment(row.id);
        found.set(row.id, shipment?.trackingNumber ?? null);
      }
      return { entries: rows, shipments: found };
    });

    // Soonest deadline first. A queue sorted by arrival looks tidier and buries
    // the order that is about to breach its SLA behind five that are not —
    // which is the only ordering that actually costs money.
    //
    // The deadline that matters is the one the order is racing NOW: the
    // confirmation clock until the house confirms, the dispatch clock after.
    // Sorting confirmed orders by a confirmation deadline they have already met
    // would put the wrong parcel at the top of the shipping step.
    const activeDeadline = (e: (typeof entries)[number]): number =>
      (e.state === 'confirmed' ? e.dispatchDueAt : e.confirmDueAt)?.getTime()
        ?? Number.MAX_SAFE_INTEGER;

    return [...entries]
      .sort((a, b) => activeDeadline(a) - activeDeadline(b))
      .map((s) => ({
        id: s.id,
        reference: s.reference,
        state: s.state,
        merchandisePiastres: s.merchandise.minor,
        shippingPiastres: s.shipping.minor,
        placedAt: s.placedAt.toISOString(),
        confirmDueAt: s.confirmDueAt?.toISOString() ?? null,
        dispatchDueAt: s.dispatchDueAt?.toISOString() ?? null,
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
        trackingNumber: shipments.get(s.id) ?? null,
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

  /**
   * The parcel has been handed to a courier.
   *
   * Two things happen together or not at all: the shipment is recorded and the
   * sub-order moves to `dispatched`. A dispatched order with no shipment is an
   * order nobody can trace, and a shipment against an order still marked
   * `confirmed` is a parcel in the world that our records say is still on a
   * shelf. Either half alone is worse than neither.
   *
   * The tracking number comes from a person reading a label, because Bosta's
   * API is not integrated yet — see `manualCourier`, which is a REAL adapter
   * for a real workflow rather than a stub, and therefore does not block a
   * launch.
   */
  dispatch: sellerProcedure
    .input(z.object({
      subOrderId: z.string().uuid(),
      trackingNumber: z.string().min(TRACKING_MIN).max(TRACKING_MAX + 10),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.uow.transaction(async (r) => {
        const sub = await r.subOrders.findById(input.subOrderId);
        if (!sub) return { ok: false as const };

        const booked = await manualCourier.book({
          subOrderReference: sub.reference,
          trackingNumber: input.trackingNumber,
          // What the courier must collect at the door. Settlement later
          // reconciles what was remitted against exactly this figure.
          codAmountPiastres: sub.merchandise.minor + sub.shipping.minor,
        }).catch(() => null);

        if (!booked) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رقم الشحنة غير صالح' });
        }

        // The state machine decides whether this move is legal BEFORE anything
        // is written, so an illegal dispatch cannot leave a shipment behind.
        const record = SubOrderLifecycle.transition(
          sub.state, { to: 'dispatched', actor: 'seller' }, ctx.clock,
        );

        await r.subOrders.recordShipment({
          subOrderId: sub.id,
          courier: booked.courier,
          trackingNumber: booked.trackingNumber,
          labelUrl: booked.labelUrl,
          codAmountPiastres: sub.merchandise.minor + sub.shipping.minor,
          dispatchedAt: ctx.clock.now(),
        });
        await r.subOrders.applyTransition(sub.id, 'dispatched', 'seller', null, record);

        return { ok: true as const, state: 'dispatched' as const, trackingNumber: booked.trackingNumber };
      });
    }),

  /**
   * The house's own payouts.
   *
   * RLS restricts these to the seller OWNER — migration 0002 keys them on
   * `app.is_seller_owner()`, so a fulfilment clerk gets an empty list rather
   * than a figure they have no business seeing. Money is owner-only and the
   * database is what enforces it; this router does not re-filter.
   */
  payouts: sellerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.payouts.listForSeller(ctx.sellerId!));
    return rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      status: p.status,
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      grossPiastres: p.gross.minor,
      commissionPiastres: p.commission.minor,
      netPiastres: p.net.minor,
      disputeDeadline: p.disputeDeadline?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
    }));
  }),

  /**
   * One statement, itemised.
   *
   * Doc 03 §7: every payout carries an itemised statement and a dispute
   * deadline. A total with nothing behind it is a number a house is asked to
   * take on faith, and the commission model cannot survive that.
   */
  statement: sellerProcedure
    .input(z.object({ payoutId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const payout = await ctx.uow.transaction((r) => r.payouts.findWithLines({
        payoutId: input.payoutId,
        sellerId: ctx.sellerId!,
      }));
      if (!payout) return null;

      return {
        reference: payout.reference,
        status: payout.status,
        periodStart: payout.periodStart.toISOString(),
        periodEnd: payout.periodEnd.toISOString(),
        grossPiastres: payout.gross.minor,
        commissionPiastres: payout.commission.minor,
        // Delivery REIMBURSED to this house, not deducted from it.
        shippingPiastres: payout.lines.reduce((sum, l) => sum + l.shipping.minor, 0),
        netPiastres: payout.net.minor,
        disputeDeadline: payout.disputeDeadline?.toISOString() ?? null,
        lines: payout.lines.map((l) => ({
          subOrderReference: l.subOrderReference,
          grossPiastres: l.gross.minor,
          commissionPiastres: l.commission.minor,
          commissionSource: l.commissionSource,
          commissionBps: l.commissionBps,
          shippingPiastres: l.shipping.minor,
          netPiastres: l.net.minor,
        })),
      };
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
