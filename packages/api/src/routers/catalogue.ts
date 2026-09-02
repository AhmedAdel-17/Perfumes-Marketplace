/**
 * Public catalogue.
 *
 * Anonymous traffic is the majority and the SEO surface. RLS already restricts
 * these reads to live houses and published listings, so the router does not
 * re-filter — duplicating the predicate here would be a second place to get it
 * wrong.
 */
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { slugSchema } from '../validation';

export const catalogueRouter = router({
  productBySlug: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.uow.transaction((r) => r.products.findBySlug(input.slug));
      if (!product) return null;
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        // Money never crosses the wire as a float. Piastres, formatted by the client.
        pricePiastres: product.price.minor,
        volumeMl: product.volumeMl,
        inStock: product.stock > 0,
      };
    }),

  houseBySlug: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }) => {
      const seller = await ctx.uow.transaction((r) => r.sellers.findBySlug(input.slug));
      if (!seller) return null;
      return { id: seller.id, slug: seller.slug, name: seller.tradingName };
    }),

  productsByHouse: publicProcedure
    .input(z.object({ sellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const products = await ctx.uow.transaction((r) =>
        r.products.listPublishedBySeller(input.sellerId));
      return products.map((p) => ({
        id: p.id, slug: p.slug, name: p.name,
        pricePiastres: p.price.minor, volumeMl: p.volumeMl, inStock: p.stock > 0,
      }));
    }),
});
