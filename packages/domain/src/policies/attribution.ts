/**
 * Attribution.
 *
 * Pattern — Chain of Responsibility (ENGINEERING_PRINCIPLES §4).
 *
 * This is the most commercially contested logic in the system. A 3–4× rate gap
 * between seller-originated and marketplace-generated orders gives every house a
 * standing financial incentive to dispute how an order was attributed, so the
 * resolver must be deterministic, explainable, and defensible after the fact.
 *
 * Handlers run in priority order; each either claims the order or defers. Adding
 * a new source is a new handler, never a new branch in an existing one — which is
 * Open/Closed applied where it matters most.
 *
 * Two things make a decision defensible:
 *   - the touch trail is kept, not just the verdict;
 *   - the attribution WINDOW is snapshotted with the decision, so changing policy
 *     later cannot retroactively rewrite what a house was charged.
 */
import type { Clock } from '../ports/clock';
import type { OrderSource } from './commission';

export type TouchChannel =
  | 'storefront_referral'
  | 'paid_campaign'
  | 'creator_affiliate'
  | 'email_crm'
  | 'organic_search'
  | 'direct';

export interface Touch {
  readonly channel: TouchChannel;
  readonly at: Date;
  /** Storefront slug, campaign id or creator code, depending on channel. */
  readonly ref?: string;
  readonly sellerId?: string;
}

export interface AttributionWindows {
  /** Doc 03 §3 — the pricing agreement must define these. Policy values, not constants. */
  readonly storefrontDays: number;
  readonly campaignDays: number;
  readonly creatorDays: number;
  readonly emailDays: number;
}

export const DEFAULT_WINDOWS: AttributionWindows = Object.freeze({
  storefrontDays: 30,
  campaignDays: 7,
  creatorDays: 7,
  emailDays: 7,
});

export interface AttributionContext {
  readonly touches: readonly Touch[];
  readonly orderedAt: Date;
  readonly sellerId: string;
  /** True when this customer has previously bought from THIS house. */
  readonly hasPriorPurchaseFromSeller: boolean;
}

export interface AttributionDecision {
  readonly source: OrderSource;
  readonly ref: string | null;
  readonly reason: string;
  readonly windows: AttributionWindows;
  readonly decidedAt: Date;
  readonly consideredTouches: number;
}

interface Handler {
  readonly name: string;
  attempt(ctx: AttributionContext, w: AttributionWindows): { source: OrderSource; ref: string | null; reason: string } | null;
}

const daysBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 86_400_000;

const withinWindow = (touch: Touch, orderedAt: Date, days: number): boolean => {
  const age = daysBetween(touch.at, orderedAt);
  return age >= 0 && age <= days;
};

/** Most recent qualifying touch on a channel, or undefined. */
const lastTouch = (
  ctx: AttributionContext,
  channel: TouchChannel,
  days: number,
): Touch | undefined =>
  ctx.touches
    .filter((t) => t.channel === channel && withinWindow(t, ctx.orderedAt, days))
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

/**
 * Priority order.
 *
 * Paid channels are evaluated before organic ones because they represent demand
 * the platform actually bought. The storefront referral sits above organic search
 * so a house that brought its own customer is not charged the marketplace rate.
 */
const HANDLERS: readonly Handler[] = [
  {
    name: 'creator_affiliate',
    attempt: (ctx, w) => {
      const t = lastTouch(ctx, 'creator_affiliate', w.creatorDays);
      return t ? { source: 'creator_affiliate', ref: t.ref ?? null, reason: `creator code within ${w.creatorDays}d` } : null;
    },
  },
  {
    name: 'paid_campaign',
    attempt: (ctx, w) => {
      const t = lastTouch(ctx, 'paid_campaign', w.campaignDays);
      return t ? { source: 'paid_campaign', ref: t.ref ?? null, reason: `platform campaign within ${w.campaignDays}d` } : null;
    },
  },
  {
    name: 'storefront_referral',
    attempt: (ctx, w) => {
      const t = lastTouch(ctx, 'storefront_referral', w.storefrontDays);
      if (!t) return null;
      // A storefront link only earns the low rate for the house that owns it.
      if (t.sellerId && t.sellerId !== ctx.sellerId) return null;
      return { source: 'storefront_referral', ref: t.ref ?? null, reason: `own storefront link within ${w.storefrontDays}d` };
    },
  },
  {
    name: 'email_crm',
    attempt: (ctx, w) => {
      const t = lastTouch(ctx, 'email_crm', w.emailDays);
      return t ? { source: 'email_crm', ref: t.ref ?? null, reason: `platform CRM within ${w.emailDays}d` } : null;
    },
  },
  {
    name: 'direct_repeat',
    attempt: (ctx) => {
      const direct = ctx.touches.some((t) => t.channel === 'direct');
      if (!direct || !ctx.hasPriorPurchaseFromSeller) return null;
      return { source: 'direct_repeat', ref: null, reason: 'returning customer of this house, direct entry' };
    },
  },
  {
    name: 'organic_search',
    attempt: (ctx) => {
      const t = ctx.touches.some((x) => x.channel === 'organic_search');
      return t ? { source: 'organic_search', ref: null, reason: 'marketplace discovery' } : null;
    },
  },
];

export class AttributionResolver {
  constructor(
    private readonly clock: Clock,
    private readonly windows: AttributionWindows = DEFAULT_WINDOWS,
  ) {}

  resolve(ctx: AttributionContext): AttributionDecision {
    for (const handler of HANDLERS) {
      const claim = handler.attempt(ctx, this.windows);
      if (claim) {
        return {
          source: claim.source,
          ref: claim.ref,
          reason: claim.reason,
          windows: this.windows,
          decidedAt: this.clock.now(),
          consideredTouches: ctx.touches.length,
        };
      }
    }

    // Nothing claimed it. `unknown` carries the LOW rate — see commission.ts.
    return {
      source: 'unknown',
      ref: null,
      reason: 'no qualifying touch; doubt resolved in favour of the house',
      windows: this.windows,
      decidedAt: this.clock.now(),
      consideredTouches: ctx.touches.length,
    };
  }
}
