/**
 * The half of the funnel that happens before an order exists — WORK_PLAN 9.5.
 *
 * A pure projection over the counts the analytics port returns, for the same
 * reason every other figure on the owner's screen is one: the rule for what a
 * stage MEANS then has a unit test and exactly one definition.
 *
 * TWO NUMBERS PER STAGE, and the difference is the whole point. `events` counts
 * rows; `visitors` counts distinct anonymous ids. One person refreshing a
 * perfume page twenty times is one visitor who looked at it, and a conversion
 * rate built on events would report that person as twenty people who did not
 * buy — which is the kind of number that funds a decision.
 *
 * A STAGE WITH NOTHING IN IT IS ZERO, not absent. The repository omits names it
 * saw no events for, because it does not invent rows; here the missing ones
 * become zeros, because a funnel with a stage missing is unreadable — and a
 * genuine zero at a stage is the most interesting thing on the screen.
 *
 * WHAT IS NOT HERE is a conversion rate from browsing to orders. The stages
 * below count VISITORS; the post-order funnel counts SUB-ORDERS, one per house
 * per basket. Dividing one by the other would produce a ratio with a different
 * unit on each side, and it would look exactly like a conversion rate. When that
 * number is wanted it needs a cohort — the visitors who later placed an order —
 * which needs the anonymous id on the order, and that is a decision A-1 did not
 * make.
 */
import { BROWSING_EVENTS, type BrowsingEvent } from './browsing-events';
import type { BrowsingCount } from '../ports/analytics-repository';

export interface PreOrderStage {
  readonly event: BrowsingEvent;
  readonly events: number;
  readonly visitors: number;
}

export interface PreOrderFunnel {
  /** Every stage, in the order a visitor meets them, zeros included. */
  readonly stages: readonly PreOrderStage[];
  /** True when nothing at all was recorded — the screen says so in words. */
  readonly isEmpty: boolean;
}

export function buildPreOrderFunnel(counts: readonly BrowsingCount[]): PreOrderFunnel {
  const byName = new Map(counts.map((count) => [count.name, count]));

  const stages = BROWSING_EVENTS.map((event): PreOrderStage => {
    const found = byName.get(event);
    return {
      event,
      events: found?.events ?? 0,
      visitors: found?.visitors ?? 0,
    };
  });

  return {
    stages,
    isEmpty: stages.every((stage) => stage.events === 0),
  };
}
