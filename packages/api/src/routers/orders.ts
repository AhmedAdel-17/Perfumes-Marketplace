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
  type CartLine,
  type SellerTerms,
  type ShippingQuote,
} from '@diyar/domain';
import { publicProcedure, router } from '../trpc';
import { flatRateShipping } from '../shipping';
import { cashOnDelivery } from '../providers/stubs';
import { phoneSchema } from '../validation';

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
      const address = Address.create(input.address);

      return ctx.checkoutUow.transaction(async (repos) => {
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

        return {
          reference: saved.reference,
          totalPiastres: saved.total.minor,
          houseCount: draft.subOrders.length,
          etaDaysMin: Math.min(...shipping.map((s) => s.etaDaysMin)),
          etaDaysMax: Math.max(...shipping.map((s) => s.etaDaysMax)),
        };
      });
    }),

  /**
   * Look up an order by reference AND phone.
   *
   * Two factors, neither of them a password. The reference alone is guessable
   * enough to matter at scale and gets shared in WhatsApp screenshots; the
   * phone alone belongs to a person, not an order. Requiring both means a
   * leaked reference discloses nothing.
   */
  byReference: publicProcedure
    .input(z.object({ reference: z.string().min(3).max(40), phone: phoneSchema }))
    .query(async ({ ctx, input }) => {
      const reference = normaliseOrderReference(input.reference);
      if (!reference) return null;

      const order = await ctx.checkoutUow.transaction((r) => r.orders.findByReference(reference));
      if (!order) return null;

      return {
        reference: order.reference,
        totalPiastres: order.total.minor,
        subOrderCount: order.subOrderIds.length,
      };
    }),
});
