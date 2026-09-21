import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  Address,
  CartPricer,
  generateOrderReference,
  GOVERNORATES,
  MAX_QUANTITY_PER_LINE,
  normaliseOrderReference,
  PlaceOrder,
  SubOrderLifecycle,
  type CartLine,
  type SellerTerms,
  type ShippingQuote,
} from '@diyar/domain';
import { publicProcedure, router } from '../trpc';
import { flatRateShipping } from '../shipping';
import { cashOnDelivery } from '../providers/stubs';
import { phoneSchema } from '../validation';
import { consume, rateLimitMessage } from '../rate-limit';

const addressSchema = z.object({
  governorate: z.enum(GOVERNORATES),
  city: z.string().min(1).max(80),
  area: z.string().min(1).max(80),
  street: z.string().min(1).max(160),
  building: z.string().min(1).max(40),
  floor: z.string().max(20).optional(),
  apartment: z.string().max(20).optional(),
  // Optional, and load-bearing: doc 03 §4 makes failed delivery the largest
  // single cost line, and a landmark is what lets a courier arrive without
  // phoning. A cost control wearing a UX costume.
  landmark: z.string().max(200).optional(),
});
/**
 * Rate limit, keyed on the phone.
 *
 * Counted before anything is written, and counted whether or not the write
 * succeeds — see `rate-limit.ts` for why that matters on paths that
 * deliberately return the same answer to a valid and an invalid caller.
 */
const limit = (name: Parameters<typeof consume>[0], key: string): void => {
  const verdict = consume(name, key);
  if (!verdict.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: rateLimitMessage(verdict.retryAfterSeconds),
    });
  }
};


export const ordersRouter = router({
  /**
   * Place an order.
   *
   * The client sends WHAT it wants — product ids, quantities, where to deliver.
   * It sends no prices, no totals and no shipping, and none would be believed:
   * the cart is priced again HERE, from the catalogue, in the same transaction
   * that writes the order. Anything else means the number the customer agreed
   * to and the number we charge can drift apart, and every marketplace fraud
   * write-up starts at that gap.
   *
   * The whole thing is one transaction. A partially written multi-seller order
   * is unrecoverable — a house would see work it is not being paid for, and the
   * customer's total would reconcile to nothing.
   */
  place: publicProcedure
    .input(
      z.object({
        contactName: z.string().min(2).max(80),
        contactPhone: phoneSchema,
        address: addressSchema,
        lines: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
            }),
          )
          .min(1)
          .max(50),
        // Only what the configured gateway can actually process is offered, so
        // this cannot be widened by editing the request.
        paymentMethod: z.literal('cod'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Before the address is even parsed. A limiter that runs after the work
      // is a limiter that still does the work.
      limit('order', input.contactPhone);

      const address = Address.create(input.address);

      const placed = await ctx.checkoutUow.transaction(async (repos) => {
        // 1. Price from the catalogue. Never from the request.
        const snapshot = await repos.products.snapshotForCart(
          input.lines.map((l) => l.productId),
        );
        const cart = new CartPricer(flatRateShipping).price(input.lines, snapshot);

        if (cart.isEmpty) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'لم يعد أي من المنتجات متاحًا',
          });
        }

        // A line that changed between the cart page and this click must not be
        // silently ordered at a different price or quantity. The customer goes
        // back to a bag that now tells them what moved.
        if (cart.adjustments.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'تغيّرت بعض المنتجات في حقيبتك. راجعها قبل إتمام الطلب.',
          });
        }

        // 2. The phone is the identity, whether or not an account exists.
        const customer = await repos.customers.findOrCreateByPhone({
          phone: input.contactPhone,
          fullName: input.contactName,
        });
        const priorPurchaseSellerIds = await repos.customers.listPriorPurchaseSellerIds(
          customer.id,
        );

        // 3. Each house's own SLA clocks, read from the house, not assumed.
        const terms: SellerTerms[] = [];
        for (const house of cart.houses) {
          const seller = await repos.sellers.findById(house.sellerId);
          if (!seller) {
            throw new TRPCError({ code: 'CONFLICT', message: 'إحدى الدور لم تعد متاحة' });
          }
          terms.push({
            sellerId: house.sellerId,
            confirmationSlaHours: seller.confirmationSlaHours,
            dispatchSlaHours: seller.dispatchSlaHours,
          });
        }

        const lines: CartLine[] = cart.houses.flatMap((house) =>
          house.lines.map((line) => ({
            productId: line.productId,
            sellerId: house.sellerId,
            // Snapshotted, so a later catalogue edit cannot rewrite this order.
            productName: line.name,
            brandName: line.brandName,
            sku: line.sku,
            volumeMl: line.volumeMl,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        );

        const shipping: ShippingQuote[] = cart.houses.map((house) => ({
          sellerId: house.sellerId,
          amount: house.shipping,
          etaDaysMin: house.etaDaysMin,
          etaDaysMax: house.etaDaysMax,
        }));

        // 4. Build. Attribution is resolved per sub-order inside PlaceOrder.
        //
        // `touches` is empty because touch capture is not built yet, which sends
        // every sub-order to `unknown` — the LOW 5% rate. That is the fair
        // default, and it is also why this is called out here rather than left
        // to be discovered: a broken touch pipeline UNDERCHARGES silently
        // instead of failing loudly.
        const draft = new PlaceOrder(ctx.clock).build({
          reference: generateOrderReference((n) => crypto.getRandomValues(new Uint8Array(n))),
          customerId: customer.id,
          contactPhone: input.contactPhone,
          contactName: input.contactName,
          address,
          lines,
          shipping,
          terms,
          paymentMethod: input.paymentMethod,
          touches: [],
          priorPurchaseSellerIds,
          orderedAt: ctx.clock.now(),
        });

        // 5. Authorise. For COD nothing is captured — the money exists when the
        // courier remits, and settlement already refuses to pay a house before
        // that happens.
        const authorisation = await cashOnDelivery.authorise({
          reference: draft.reference,
          amountPiastres: draft.total.minor,
          method: input.paymentMethod,
        });
        if (!authorisation.authorised) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'تعذّر تأكيد طريقة الدفع' });
        }

        // 6. Persist. `sellerIdBySlug` is the repository's name for "how do I
        // turn the draft's seller key into a row id" — the cart already carries
        // real ids, so the mapping is the identity.
        const identity = new Map(cart.houses.map((h) => [h.sellerId, h.sellerId]));
        const saved = await repos.orders.save(draft, identity);

        // 7. Hand each sub-order to its house.
        //
        // `placed` means the marketplace holds the order; `awaiting_seller`
        // means the HOUSE HAS BEEN TOLD and its confirmation SLA is running.
        // Without this step an order arrives in the seller queue in a state the
        // machine will not let the house confirm from — the house sees the
        // order and cannot accept it, which is exactly what shipped.
        //
        // Inside the same transaction, so an order that could not be handed
        // over does not exist. When notifications are built they dispatch from
        // precisely here: the transition IS the moment the house was told.
        for (const subOrderId of saved.subOrderIds) {
          const record = SubOrderLifecycle.transition(
            'placed', { to: 'awaiting_seller', actor: 'system' }, ctx.clock,
          );
          await repos.subOrders.applyTransition(
            subOrderId, 'awaiting_seller', 'system', null, record,
          );
        }

        return {
          reference: saved.reference,
          totalPiastres: saved.total.minor,
          houseCount: draft.subOrders.length,
          etaDaysMin: Math.min(...shipping.map((s) => s.etaDaysMin)),
          etaDaysMax: Math.max(...shipping.map((s) => s.etaDaysMax)),
        };
      });

      /*
       * AFTER the transaction, never inside it (P1.4.3). A line written inside
       * would record an order that a later statement rolled back, and the log
       * would then disagree with the database about whether a customer's order
       * exists — which is the one question it is read to answer.
       *
       * The order reference and the request id, and NOT the phone: the scrubber
       * would mask it anyway, but the rule is not to hand it over at all. The
       * reference is how support finds everything else.
       */
      ctx.log.info('orders.place', {
        order_ref: placed.reference,
        houses: placed.houseCount,
        total_piastres: placed.totalPiastres,
        payment_method: input.paymentMethod,
      });

      return placed;
    }),

  /**
   * Look up an order by reference AND phone.
   *
   * Two factors, neither of them a password. The reference alone gets shared in
   * WhatsApp screenshots; the phone alone belongs to a person, not an order.
   *
   * The first version of this took a phone, said all of the above, and never
   * compared it — so any leaked reference disclosed the customer's name, their
   * address and everything they bought. The fix is not "remember to compare":
   * the phone is now a predicate inside `findForCustomerLookup`, because a
   * WHERE clause cannot be forgotten and a comparison can.
   *
   * A wrong phone returns null exactly as an unknown reference does, so this
   * endpoint cannot be used to discover which references exist.
   */
  byReference: publicProcedure
    .input(z.object({ reference: z.string().min(3).max(40), phone: phoneSchema }))
    .query(async ({ ctx, input }) => {
      const reference = normaliseOrderReference(input.reference);
      if (!reference) return null;

      const order = await ctx.checkoutUow.transaction((r) =>
        r.orders.findForCustomerLookup({ reference, phone: input.phone }));
      if (!order) return null;

      return {
        reference: order.reference,
        contactName: order.contactName,
        placedAt: order.placedAt.toISOString(),
        paymentMethod: order.paymentMethod,
        totalPiastres: order.total.minor,
        houses: order.houses.map((h) => ({
          reference: h.reference,
          trackingNumber: h.trackingNumber,
          brandName: h.brandName,
          state: h.state,
          merchandisePiastres: h.merchandise.minor,
          shippingPiastres: h.shipping.minor,
          items: h.items.map((i) => ({
            name: i.name,
            brandName: i.brandName,
            quantity: i.quantity,
            unitPricePiastres: i.unitPrice.minor,
          })),
        })),
      };
    }),
});
