/**
 * Cart pricing.
 *
 * A public procedure, because a shopper must be able to fill a basket and see a
 * total before identifying themselves. Requiring a login to see a price is the
 * single most reliable way to lose a first-time customer, and nothing here
 * writes anything.
 *
 * The router is a FACADE (ARCHITECTURE.md): it validates the request, reads a
 * catalogue snapshot, hands both to `CartPricer`, and maps money to piastres on
 * the way out. Every rule about availability, stock, caps and grouping lives in
 * the domain, where it is tested without a database.
 */
import { z } from 'zod';
import { CartPricer, MAX_QUANTITY_PER_LINE } from '@diyar/domain';
import { publicProcedure, router } from '../trpc';
import { flatRateShipping } from '../shipping';

const cartLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
  /**
   * What the browser last saw. Reported back if it has changed; never summed.
   * Optional because a cart restored from an older client will not have it.
   */
  seenPricePiastres: z.number().int().nonnegative().optional(),
});

export const cartRouter = router({
  price: publicProcedure
    .input(
      z.object({
        // A cap here as well as per line: the request body is attacker-controlled,
        // and an unbounded list is an unbounded query.
        lines: z.array(cartLineSchema).max(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ids = input.lines.map((l) => l.productId);
      const snapshot = await ctx.uow.transaction((r) => r.products.snapshotForCart(ids));

      const cart = new CartPricer(flatRateShipping).price(input.lines, snapshot);

      return {
        houses: cart.houses.map((h) => ({
          sellerId: h.sellerId,
          brandName: h.brandName,
          brandLatin: h.brandLatin,
          merchandisePiastres: h.merchandise.minor,
          shippingPiastres: h.shipping.minor,
          etaDaysMin: h.etaDaysMin,
          etaDaysMax: h.etaDaysMax,
          lines: h.lines.map((l) => ({
            productId: l.productId,
            slug: l.slug,
            name: l.name,
            nameEn: l.nameEn,
            brandName: l.brandName,
            brandLatin: l.brandLatin,
            volumeMl: l.volumeMl,
            scentFamily: l.scentFamily,
            quantity: l.quantity,
            unitPricePiastres: l.unitPrice.minor,
            lineTotalPiastres: l.lineTotal.minor,
            maxQuantity: l.maxQuantity,
            // The key becomes a URL here, at the edge, where the store is known.
            photo: l.photo
              ? {
                url: ctx.media.publicUrl(l.photo.storageKey),
                alt: l.photo.alt,
                width: l.photo.width,
                height: l.photo.height,
              }
              : null,
          })),
        })),
        merchandisePiastres: cart.merchandise.minor,
        shippingPiastres: cart.shipping.minor,
        totalPiastres: cart.total.minor,
        itemCount: cart.itemCount,
        isEmpty: cart.isEmpty,
        adjustments: cart.adjustments.map((a) => ({
          productId: a.productId,
          productName: a.productName,
          reason: a.reason,
          requestedQuantity: a.requestedQuantity,
          acceptedQuantity: a.acceptedQuantity,
          previousPricePiastres: a.previousPrice?.minor,
          currentPricePiastres: a.currentPrice?.minor,
        })),
      };
    }),
});
