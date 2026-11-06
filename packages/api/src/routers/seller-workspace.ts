import { router, sellerProcedure } from '../trpc';

/** Facade: public house metadata for the session's own workspace, with no
 * input seller selector and no contact, commission or customer information. */
export const sellerWorkspaceRouter = router({
  profile: sellerProcedure.query(async ({ ctx }) => {
    const house = await ctx.uow.transaction(r => r.sellers.findById(ctx.sellerId));
    return house ? { name: house.tradingName, slug: house.slug, status: house.status } : null;
  }),
});
