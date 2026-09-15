/**
 * What the owner sees — doc 04 §8 gate 8, computed.
 *
 * Pattern — a pure read-model projection (ENGINEERING_PRINCIPLES §4): a list of
 * facts in, a report out, no clock and no I/O. Every definition below is the one
 * written in `docs/ANALYTICS_DEFINITIONS.md` BEFORE this file existed; if the two
 * ever disagree, the document is right and this is the bug.
 *
 * FOUR RULES, enforced here rather than hoped for in a screen:
 *
 *  1. "Completed" is the payout's own answer. `classifyForSettlement` decides it
 *     for both, so the owner's GMV cannot disagree with what houses are paid.
 *  2. Rates are returned as a numerator and a denominator, never a percentage.
 *     A rate over zero orders is not 0% and not 100%; it is "no orders yet",
 *     and only a denominator can say so.
 *  3. An input the system does not record comes back as `not_recorded` with no
 *     amount. There is no code path that turns an unknown cost into zero.
 *  4. No contribution margin. Doc 03 §4 defines it over eight terms; the system
 *     records four. A margin from half its terms is a different number wearing
 *     the margin's name, so this module does not produce one.
 */
import { Money, sumMoney, type BasisPoints } from '../value-objects/money';
import { CommissionPolicy, type OrderSource } from '../policies/commission';
import type { ReasonCode } from '../state-machines/sub-order';
import type { SettlementSubOrder } from '../services/settlement';
import { classifyForSettlement } from '../services/settlement-classify';

export interface OwnerReportSubOrder extends SettlementSubOrder {
  readonly orderId: string;
  readonly sellerId: string;
  readonly governorate: string;
  readonly placedAt: Date;
  readonly confirmDueAt: Date | null;
  /**
   * When the house ANSWERED — confirmed or declined. Null while it has not.
   *
   * The confirmation SLA measures answering in time. A house that declines an
   * out-of-stock order in ten minutes has kept its promise to the customer;
   * counting that against it would teach houses to sit on orders they cannot
   * fill rather than release them.
   */
  readonly respondedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly dispatchDueAt: Date | null;
  readonly dispatchedAt: Date | null;
  /** The coded reason on the exit transition; null for an order still moving. */
  readonly exitReason: ReasonCode | null;
  /** The house's reserve period — the payout's own input, per house. */
  readonly reserveDays: number;
}

export interface OwnerReportInput {
  readonly subOrders: readonly OwnerReportSubOrder[];
  /** The moment the report describes. Deadlines and holds are judged against it. */
  readonly asOf: Date;
  /** Refunds whose cost the platform bears (`returns.cost_bearer = 'platform'`). */
  readonly platformRefunds: Money;
  /** Support tickets opened in the period. A count — no cost per ticket exists (A-3). */
  readonly ticketCount: number;
  /** Order-level discounts in the period (`orders.discount_piastres`). */
  readonly discounts: Money;
}

/** A proportion that knows when it has nothing to measure. */
export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
}

export type ExitState = 'rejected' | 'cancelled' | 'refused' | 'returned';

export interface Exit {
  readonly total: number;
  readonly byReason: Readonly<Partial<Record<ReasonCode, number>>>;
}

export interface Funnel {
  readonly placed: number;
  readonly confirmed: number;
  readonly dispatched: number;
  readonly delivered: number;
  readonly completed: number;
  readonly exits: Readonly<Record<ExitState, Exit>>;
}

export interface SellerSla {
  readonly sellerId: string;
  readonly placed: number;
  readonly answeredOnTime: Rate;
  readonly unansweredPastDeadline: number;
  readonly medianMinutesToAnswer: number | null;
  readonly dispatchedOnTime: Rate;
  readonly unshippedPastDeadline: number;
  readonly rejection: Rate;
  readonly refusal: Rate;
  readonly returns: Rate;
}

export type InputStatus =
  | 'recorded'
  /** Genuinely zero because of how the business is arranged, and labelled so. */
  | 'zero_by_arrangement'
  /** Something is counted; its cost is not. Never converted to money here. */
  | 'count_only'
  | 'not_recorded';

export type ContributionInputKey =
  | 'platform_revenue'
  | 'payment_cost'
  | 'delivery_subsidy'
  | 'platform_refunds'
  | 'failed_delivery'
  | 'variable_support'
  | 'promotional_subsidy'
  | 'affiliate_cost'
  | 'fraud_loss';

export interface ContributionInput {
  readonly key: ContributionInputKey;
  readonly status: InputStatus;
  /** Present only when `status` is `recorded` or `zero_by_arrangement`. */
  readonly amount: Money | null;
  /** Present only when `status` is `count_only`. */
  readonly count: number | null;
}

export interface SourceShare {
  readonly source: OrderSource;
  readonly gmv: Money;
  readonly subOrders: number;
}

export interface OwnerReport {
  readonly asOf: Date;
  readonly funnel: Funnel;
  readonly sla: readonly SellerSla[];
  readonly refusalByGovernorate: Readonly<Record<string, Rate>>;
  readonly gmv: Money;
  /** Delivered but not yet earned — shown beside GMV so a good week is not mistaken for cash. */
  readonly heldGmv: Money;
  readonly platformRevenue: Money;
  readonly effectiveTakeRateBps: BasisPoints;
  readonly completedOrders: number;
  /** Null when nothing is completed: an average of nothing is not zero pounds. */
  readonly aov: Money | null;
  readonly sourceMix: readonly SourceShare[];
  readonly contributionInputs: readonly ContributionInput[];
}

const EXIT_STATES: readonly ExitState[] = ['rejected', 'cancelled', 'refused', 'returned'];

const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator });

const isPast = (deadline: Date | null, asOf: Date): boolean =>
  deadline !== null && asOf.getTime() > deadline.getTime();

const onOrBefore = (at: Date, deadline: Date): boolean => at.getTime() <= deadline.getTime();

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function slaFor(sellerId: string, subs: readonly OwnerReportSubOrder[], asOf: Date): SellerSla {
  // Measured: answered, or still unanswered after the deadline. An order with
  // hours left is neither on time nor late, so it is in neither count.
  const answerMeasured = subs.filter((s) =>
    s.confirmDueAt !== null && (s.respondedAt !== null || isPast(s.confirmDueAt, asOf)));
  const answeredOnTime = answerMeasured.filter((s) =>
    s.respondedAt !== null && onOrBefore(s.respondedAt, s.confirmDueAt!));

  const waitingForAnswer = subs.filter((s) =>
    (s.state === 'placed' || s.state === 'awaiting_seller') && isPast(s.confirmDueAt, asOf));

  const minutesToAnswer = subs
    .filter((s) => s.respondedAt !== null)
    .map((s) => Math.round((s.respondedAt!.getTime() - s.placedAt.getTime()) / 60_000));

  // Only confirmed orders have a dispatch clock at all.
  const dispatchMeasured = subs.filter((s) =>
    s.dispatchDueAt !== null && (s.dispatchedAt !== null || isPast(s.dispatchDueAt, asOf)));
  const dispatchedOnTime = dispatchMeasured.filter((s) =>
    s.dispatchedAt !== null && onOrBefore(s.dispatchedAt, s.dispatchDueAt!));

  const waitingToShip = subs.filter((s) => s.state === 'confirmed' && isPast(s.dispatchDueAt, asOf));

  const dispatched = subs.filter((s) => s.dispatchedAt !== null);
  const delivered = subs.filter((s) => s.deliveredAt !== undefined);

  return {
    sellerId,
    placed: subs.length,
    answeredOnTime: rate(answeredOnTime.length, answerMeasured.length),
    unansweredPastDeadline: waitingForAnswer.length,
    medianMinutesToAnswer: median(minutesToAnswer),
    dispatchedOnTime: rate(dispatchedOnTime.length, dispatchMeasured.length),
    unshippedPastDeadline: waitingToShip.length,
    rejection: rate(subs.filter((s) => s.state === 'rejected').length, subs.length),
    refusal: rate(dispatched.filter((s) => s.state === 'refused').length, dispatched.length),
    returns: rate(delivered.filter((s) => s.state === 'returned').length, delivered.length),
  };
}

export function buildOwnerReport(input: OwnerReportInput): OwnerReport {
  const { subOrders, asOf } = input;

  const classified = subOrders.map((s) => ({
    sub: s,
    outcome: classifyForSettlement(s, asOf, s.reserveDays).outcome,
  }));
  const earned = classified.filter((c) => c.outcome === 'earned').map((c) => c.sub);
  const held = classified.filter((c) => c.outcome === 'held').map((c) => c.sub);

  // ------------------------------------------------------------------ funnel
  const exits = Object.fromEntries(EXIT_STATES.map((state) => {
    const leaving = subOrders.filter((s) => s.state === state);
    const byReason: Partial<Record<ReasonCode, number>> = {};
    for (const s of leaving) {
      if (s.exitReason) byReason[s.exitReason] = (byReason[s.exitReason] ?? 0) + 1;
    }
    return [state, { total: leaving.length, byReason }];
  })) as Record<ExitState, Exit>;

  const funnel: Funnel = {
    placed: subOrders.length,
    // Reached, not currently in: a delivered order was also confirmed and
    // dispatched, and the timestamps are what say so.
    confirmed: subOrders.filter((s) => s.confirmedAt !== null).length,
    dispatched: subOrders.filter((s) => s.dispatchedAt !== null).length,
    delivered: subOrders.filter((s) => s.deliveredAt !== undefined).length,
    completed: earned.length,
    exits,
  };

  // --------------------------------------------------------------------- SLA
  const bySeller = new Map<string, OwnerReportSubOrder[]>();
  for (const s of subOrders) {
    const list = bySeller.get(s.sellerId) ?? [];
    list.push(s);
    bySeller.set(s.sellerId, list);
  }
  const sla = [...bySeller.entries()]
    .map(([sellerId, subs]) => slaFor(sellerId, subs, asOf))
    .sort((a, b) => b.placed - a.placed);

  const byGovernorate = new Map<string, { refused: number; dispatched: number }>();
  for (const s of subOrders.filter((x) => x.dispatchedAt !== null)) {
    const entry = byGovernorate.get(s.governorate) ?? { refused: 0, dispatched: 0 };
    entry.dispatched += 1;
    if (s.state === 'refused') entry.refused += 1;
    byGovernorate.set(s.governorate, entry);
  }
  const refusalByGovernorate = Object.fromEntries(
    [...byGovernorate.entries()].map(([g, e]) => [g, rate(e.refused, e.dispatched)]),
  );

  // ------------------------------------------------------------------- money
  const commissionOf = (s: OwnerReportSubOrder) => CommissionPolicy.charge(
    s.merchandise, { source: s.commissionSource, bps: s.commissionBps, ruleSetVersion: 0 },
  );

  const gmv = sumMoney(earned.map((s) => s.merchandise));
  const platformRevenue = sumMoney(earned.map(commissionOf));
  const completedOrders = new Set(earned.map((s) => s.orderId)).size;

  const mix = new Map<OrderSource, { gmv: Money; subOrders: number }>();
  for (const s of earned) {
    const entry = mix.get(s.commissionSource) ?? { gmv: Money.zero(), subOrders: 0 };
    mix.set(s.commissionSource, { gmv: entry.gmv.plus(s.merchandise), subOrders: entry.subOrders + 1 });
  }

  // --------------------------------------------------------- contribution inputs
  const platformBooksDelivery = earned.some((s) => s.deliveryFulfilledBy === 'platform');
  const refused = subOrders.filter((s) => s.state === 'refused').length;

  const recorded = (key: ContributionInputKey, amount: Money): ContributionInput =>
    ({ key, status: 'recorded', amount, count: null });
  const counted = (key: ContributionInputKey, count: number): ContributionInput =>
    ({ key, status: 'count_only', amount: null, count });
  const unknown = (key: ContributionInputKey): ContributionInput =>
    ({ key, status: 'not_recorded', amount: null, count: null });

  const contributionInputs: ContributionInput[] = [
    recorded('platform_revenue', platformRevenue),
    // No provider fee and no COD collection fee is stored anywhere. D-5.
    unknown('payment_cost'),
    // Every house books and pays its own courier today, so the platform funds
    // no delivery — a true zero, labelled as the arrangement rather than as a
    // measurement. The moment the platform books a courier, the courier's
    // charge is a cost this system does not store, and the input says so.
    platformBooksDelivery
      ? unknown('delivery_subsidy')
      : { key: 'delivery_subsidy', status: 'zero_by_arrangement', amount: Money.zero(), count: null },
    recorded('platform_refunds', input.platformRefunds),
    counted('failed_delivery', refused),
    counted('variable_support', input.ticketCount),
    recorded('promotional_subsidy', input.discounts),
    unknown('affiliate_cost'),
    unknown('fraud_loss'),
  ];

  return {
    asOf,
    funnel,
    sla,
    refusalByGovernorate,
    gmv,
    heldGmv: sumMoney(held.map((s) => s.merchandise)),
    platformRevenue,
    effectiveTakeRateBps: CommissionPolicy.effectiveRateBps(gmv, platformRevenue),
    completedOrders,
    aov: completedOrders === 0 ? null : Money.fromMinor(Math.round(gmv.minor / completedOrders)),
    sourceMix: [...mix.entries()]
      .map(([source, e]) => ({ source, gmv: e.gmv, subOrders: e.subOrders }))
      .sort((a, b) => b.gmv.minor - a.gmv.minor),
    contributionInputs,
  };
}
