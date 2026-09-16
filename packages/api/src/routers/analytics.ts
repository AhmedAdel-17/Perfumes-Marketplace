import { z } from 'zod';
import {
  ANONYMOUS_ID_PATTERN, BROWSING_EVENTS, objectionsToRecording,
} from '@diyar/domain';
import { consume } from '../rate-limit';
import { publicProcedure, router } from '../trpc';

/**
 * The browsing trail — WORK_PLAN 9.5, founder decision A-1.
 *
 * ONE PROCEDURE, AND THE HANDLER NEVER THROWS. Everything else in this API
 * answers a person who is waiting: a refusal is information they need. Nobody is
 * waiting for this. It is fired as a side effect of a page a visitor is already
 * reading, and the worst outcome of a dropped event is that a count is one lower
 * than it should be — while the worst outcome of throwing is a red error on a
 * product page because an analytics row was malformed. So every rejection the
 * HANDLER makes is `{ recorded: false }` and the page carries on.
 *
 * Malformed input is still refused at the boundary, by the schema below, exactly
 * as everywhere else in this API — that path does throw, and the one caller
 * (`recordBrowsing`) swallows it, because a visitor reading about a perfume must
 * not be shown an error about analytics whichever layer refused.
 *
 * Three layers check the same rules: zod here, the domain's
 * `objectionsToRecording` after it, and the database's own WITH CHECK (0023)
 * under both. The visitor never sees any of the three.
 *
 * NO IDENTITY REACHES THIS. The input has no field for a customer, an order, a
 * search term or a campaign — see `browsing-events.ts` for why each is absent.
 * The anonymous id is issued by the site itself and means nothing anywhere else.
 */
export const analyticsRouter = router({
  record: publicProcedure
    .input(z.object({
      name: z.enum(BROWSING_EVENTS),
      anonymousId: z.string().regex(ANONYMOUS_ID_PATTERN),
      /** The perfume this is about — `product_view`, `cart_add`. */
      productId: z.string().uuid().optional(),
      /** The house this is about — `storefront_view`. */
      sellerId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /*
       * A courtesy limit, keyed on the anonymous id.
       *
       * It does not stop a determined flood — an attacker rotates ids as easily
       * as they rotate anything else, and the honest answer is that an edge rate
       * limit is what stops that. What it does stop is one looping page or one
       * mistaken `useEffect` filling the table from a single browser, which is
       * the failure that actually happens.
       */
      const verdict = consume('browsing', input.anonymousId);
      if (!verdict.allowed) return { recorded: false as const };

      // The same rules the domain states, applied before the row is built. The
      // zod schema above already refuses these; this is the layer that would
      // still refuse if a future caller reached the service directly.
      if (objectionsToRecording(input).length > 0) return { recorded: false as const };

      await ctx.analyticsUow.transaction((r) => r.analytics.record({
        name: input.name,
        anonymousId: input.anonymousId,
        productId: input.productId ?? null,
        sellerId: input.sellerId ?? null,
        occurredAt: ctx.clock.now(),
      }));

      return { recorded: true as const };
    }),
});
