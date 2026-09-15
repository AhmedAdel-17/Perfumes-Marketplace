import { describe, expect, it } from 'vitest';
import { Money } from '../value-objects/money';
import { FixedClock } from '../ports/clock';
import { SettlementService } from '../services/settlement';
import { buildOwnerReport, type OwnerReportSubOrder } from './owner-metrics';

const AS_OF = new Date('2026-09-15T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(AS_OF.getTime() - ms);
const egp = (major: number) => Money.fromMinor(major * 100);

let seq = 0;

/** A sub-order that has done nothing yet, placed two days ago. Every case overrides what it needs. */
function sub(overrides: Partial<OwnerReportSubOrder> = {}): OwnerReportSubOrder {
  seq += 1;
  return {
    id: `sub-${seq}`,
    reference: `DY-TEST${seq}-A`,
    orderId: `order-${seq}`,
    sellerId: 'ward',
    governorate: 'cairo',
    state: 'awaiting_seller',
    merchandise: egp(400),
    shipping: egp(50),
    commissionSource: 'organic_search',
    commissionBps: 1500,
    cashInHand: false,
    deliveryFulfilledBy: 'seller',
    placedAt: ago(2 * DAY),
    confirmDueAt: ago(2 * DAY - 24 * HOUR),
    respondedAt: null,
    confirmedAt: null,
    dispatchDueAt: null,
    dispatchedAt: null,
    exitReason: null,
    reserveDays: 7,
    ...overrides,
  };
}

/** Delivered long enough ago, cash remitted: what a payout calls earned. */
const earned = (overrides: Partial<OwnerReportSubOrder> = {}) => sub({
  state: 'delivered',
  placedAt: ago(20 * DAY),
  confirmDueAt: ago(19 * DAY),
  respondedAt: ago(20 * DAY - 2 * HOUR),
  confirmedAt: ago(20 * DAY - 2 * HOUR),
  dispatchDueAt: ago(18 * DAY),
  dispatchedAt: ago(19 * DAY),
  deliveredAt: ago(17 * DAY),
  cashInHand: true,
  ...overrides,
});

const report = (subOrders: OwnerReportSubOrder[], extra: Partial<Parameters<typeof buildOwnerReport>[0]> = {}) =>
  buildOwnerReport({
    subOrders,
    asOf: AS_OF,
    platformRefunds: Money.zero(),
    ticketCount: 0,
    discounts: Money.zero(),
    ...extra,
  });

describe('the funnel — stages reached, and every exit with its reason', () => {
  it('counts a stage as REACHED by its timestamp, not by where the order is now', () => {
    // A delivered order was confirmed and dispatched too. Counting by current
    // state would report a funnel whose middle stages shrink as orders succeed.
    const r = report([earned(), sub(), sub({ state: 'confirmed', confirmedAt: ago(DAY) })]);
    expect(r.funnel).toMatchObject({ placed: 3, confirmed: 2, dispatched: 1, delivered: 1, completed: 1 });
  });

  it('reports every exit with its coded reason', () => {
    const r = report([
      sub({ state: 'rejected', exitReason: 'out_of_stock', respondedAt: ago(DAY) }),
      sub({ state: 'rejected', exitReason: 'out_of_stock', respondedAt: ago(DAY) }),
      sub({ state: 'rejected', exitReason: 'area_not_served', respondedAt: ago(DAY) }),
      sub({ state: 'refused', exitReason: 'customer_unreachable', dispatchedAt: ago(DAY) }),
    ]);
    expect(r.funnel.exits.rejected).toEqual({
      total: 3, byReason: { out_of_stock: 2, area_not_served: 1 },
    });
    expect(r.funnel.exits.refused.byReason).toEqual({ customer_unreachable: 1 });
    expect(r.funnel.exits.cancelled).toEqual({ total: 0, byReason: {} });
  });
});

describe('completed means what the PAYOUT means', () => {
  it('does not count a delivery whose cash has not arrived', () => {
    const r = report([earned({ cashInHand: false })]);
    expect(r.gmv.minor).toBe(0);
    expect(r.heldGmv.minor).toBe(400_00);
    expect(r.funnel.completed).toBe(0);
  });

  it('does not count a delivery still inside the house’s reserve period', () => {
    const r = report([earned({ deliveredAt: ago(2 * DAY), reserveDays: 7 })]);
    expect(r.gmv.minor).toBe(0);
    expect(r.heldGmv.minor).toBe(400_00);
  });

  it('does not count a returned order at all', () => {
    const r = report([earned({ state: 'returned', exitReason: 'defective' })]);
    expect(r.gmv.minor).toBe(0);
    expect(r.heldGmv.minor).toBe(0);
  });

  it('agrees with SettlementService to the piastre — one definition, two screens', () => {
    /*
     * The case the whole module rests on. The same sub-orders go through the
     * payout builder and the owner report, and the money each calls earned and
     * held must be identical. If a hold rule is ever added to one and not the
     * other, this fails before an owner reads a GMV no house was paid on.
     */
    const subs = [
      earned(),
      earned({ merchandise: egp(750) }),
      earned({ cashInHand: false, merchandise: egp(300) }),
      earned({ deliveredAt: ago(DAY), merchandise: egp(220) }),
      earned({ state: 'returned', exitReason: 'changed_mind' }),
      sub({ state: 'refused', dispatchedAt: ago(DAY) }),
      sub(),
    ];
    const statement = new SettlementService(new FixedClock(AS_OF)).build({
      sellerId: 'ward',
      periodStart: ago(60 * DAY),
      periodEnd: AS_OF,
      subOrders: subs,
      adjustments: [],
      reserveDays: 7,
      disputeWindowDays: 7,
    });
    const earnedGross = statement.lines
      .filter((l) => l.outcome === 'earned')
      .reduce((sum, l) => sum + l.gross.minor, 0);

    const r = report(subs);
    expect(r.gmv.minor).toBe(earnedGross);
    expect(r.heldGmv.minor).toBe(statement.heldGross.minor);
  });
});

describe('seller SLA — answering in time, shipping in time', () => {
  it('a prompt DECLINE is an on-time answer, and shows in the rejection rate instead', () => {
    // Counting a ten-minute decline as a breach would teach houses to sit on
    // orders they cannot fill.
    const r = report([
      sub({ state: 'rejected', exitReason: 'out_of_stock', respondedAt: ago(2 * DAY - HOUR) }),
    ]);
    expect(r.sla[0]!.answeredOnTime).toEqual({ numerator: 1, denominator: 1 });
    expect(r.sla[0]!.rejection).toEqual({ numerator: 1, denominator: 1 });
  });

  it('an unanswered order past its deadline is late AND an open breach', () => {
    const r = report([sub()]); // due a day ago, never answered
    expect(r.sla[0]!.answeredOnTime).toEqual({ numerator: 0, denominator: 1 });
    expect(r.sla[0]!.unansweredPastDeadline).toBe(1);
  });

  it('an order with time still left is measured as NEITHER on time nor late', () => {
    const r = report([sub({ placedAt: ago(HOUR), confirmDueAt: new Date(AS_OF.getTime() + 23 * HOUR) })]);
    expect(r.sla[0]!.answeredOnTime).toEqual({ numerator: 0, denominator: 0 });
    expect(r.sla[0]!.unansweredPastDeadline).toBe(0);
  });

  it('an answer after the deadline counts as late', () => {
    const r = report([sub({
      state: 'confirmed',
      respondedAt: ago(2 * DAY - 30 * HOUR),
      confirmedAt: ago(2 * DAY - 30 * HOUR),
      dispatchDueAt: new Date(AS_OF.getTime() + DAY),
    })]);
    expect(r.sla[0]!.answeredOnTime).toEqual({ numerator: 0, denominator: 1 });
  });

  it('a confirmed order past its dispatch deadline is late and an open breach', () => {
    const r = report([sub({
      state: 'confirmed',
      respondedAt: ago(3 * DAY),
      confirmedAt: ago(3 * DAY),
      dispatchDueAt: ago(DAY),
    })]);
    expect(r.sla[0]!.dispatchedOnTime).toEqual({ numerator: 0, denominator: 1 });
    expect(r.sla[0]!.unshippedPastDeadline).toBe(1);
  });

  it('an order never confirmed has no dispatch clock, so it is not in the dispatch rate', () => {
    const r = report([sub()]);
    expect(r.sla[0]!.dispatchedOnTime).toEqual({ numerator: 0, denominator: 0 });
  });

  it('reports the median time to answer, in minutes', () => {
    const placedAt = ago(5 * DAY);
    const r = report([10, 30, 200].map((minutes) => sub({
      state: 'confirmed',
      placedAt,
      confirmDueAt: new Date(placedAt.getTime() + DAY),
      respondedAt: new Date(placedAt.getTime() + minutes * 60_000),
      confirmedAt: new Date(placedAt.getTime() + minutes * 60_000),
    })));
    expect(r.sla[0]!.medianMinutesToAnswer).toBe(30);
  });

  it('keeps each house’s figures apart', () => {
    const r = report([sub({ sellerId: 'ward' }), sub({ sellerId: 'ward' }), sub({ sellerId: 'nour' })]);
    expect(r.sla.map((s) => [s.sellerId, s.placed])).toEqual([['ward', 2], ['nour', 1]]);
  });
});

describe('refusals and returns — with the right denominators', () => {
  it('refusal is over DISPATCHED orders, by governorate', () => {
    // A parcel that never left cannot be refused at the door.
    const r = report([
      sub({ state: 'refused', governorate: 'giza', dispatchedAt: ago(DAY), exitReason: 'customer_refused' }),
      earned({ governorate: 'giza' }),
      earned({ governorate: 'cairo' }),
      sub({ governorate: 'giza' }),
    ]);
    expect(r.refusalByGovernorate).toEqual({
      giza: { numerator: 1, denominator: 2 },
      cairo: { numerator: 0, denominator: 1 },
    });
  });

  it('returns are over DELIVERED orders', () => {
    const r = report([
      earned({ state: 'returned', exitReason: 'defective' }),
      earned(),
      earned(),
      sub(),
    ]);
    expect(r.sla[0]!.returns).toEqual({ numerator: 1, denominator: 3 });
  });
});

describe('money — GMV never alone', () => {
  it('computes revenue from each order’s SNAPSHOTTED rate, and the take rate from it', () => {
    const r = report([
      earned({ commissionSource: 'organic_search', commissionBps: 1500, merchandise: egp(400) }),
      earned({ commissionSource: 'storefront_referral', commissionBps: 500, merchandise: egp(600) }),
    ]);
    expect(r.gmv.minor).toBe(1000_00);
    expect(r.platformRevenue.minor).toBe(60_00 + 30_00);
    expect(r.effectiveTakeRateBps).toBe(900);
  });

  it('averages over ORDERS, not sub-orders — a two-house basket is one order', () => {
    const r = report([
      earned({ orderId: 'basket', sellerId: 'ward', merchandise: egp(400) }),
      earned({ orderId: 'basket', sellerId: 'nour', merchandise: egp(600) }),
      earned({ orderId: 'single', merchandise: egp(500) }),
    ]);
    expect(r.completedOrders).toBe(2);
    expect(r.aov!.minor).toBe(750_00);
  });

  it('an average of nothing is null, not zero pounds', () => {
    const r = report([sub()]);
    expect(r.aov).toBeNull();
    expect(r.effectiveTakeRateBps).toBe(0);
  });

  it('breaks GMV down by the source billing used, largest first', () => {
    const r = report([
      earned({ commissionSource: 'storefront_referral', merchandise: egp(300) }),
      earned({ commissionSource: 'organic_search', merchandise: egp(900) }),
      earned({ commissionSource: 'storefront_referral', merchandise: egp(100) }),
    ]);
    expect(r.sourceMix.map((m) => [m.source, m.gmv.minor, m.subOrders])).toEqual([
      ['organic_search', 900_00, 1],
      ['storefront_referral', 400_00, 2],
    ]);
  });
});

describe('contribution inputs — unrecorded is never zero', () => {
  it('reports every doc 03 §4 term with its honest status', () => {
    const r = report([earned(), sub({ state: 'refused', dispatchedAt: ago(DAY) })], {
      platformRefunds: egp(120),
      ticketCount: 4,
      discounts: Money.zero(),
    });
    const byKey = Object.fromEntries(r.contributionInputs.map((i) => [i.key, i]));

    expect(byKey.platform_revenue).toMatchObject({ status: 'recorded' });
    expect(byKey.platform_refunds!.amount!.minor).toBe(120_00);
    expect(byKey.failed_delivery).toEqual({ key: 'failed_delivery', status: 'count_only', amount: null, count: 1 });
    expect(byKey.variable_support).toMatchObject({ status: 'count_only', count: 4, amount: null });
    expect(byKey.delivery_subsidy).toMatchObject({ status: 'zero_by_arrangement' });
  });

  it('gives an UNRECORDED input no amount at all — there is no path that turns unknown into zero', () => {
    const r = report([earned()]);
    const unrecorded = r.contributionInputs.filter((i) => i.status === 'not_recorded');
    expect(unrecorded.map((i) => i.key).sort()).toEqual(['affiliate_cost', 'fraud_loss', 'payment_cost']);
    for (const input of unrecorded) {
      expect(input.amount).toBeNull();
      expect(input.count).toBeNull();
    }
  });

  it('stops calling delivery subsidy zero the moment the platform books a courier', () => {
    // Zero "by arrangement" is only true while the arrangement holds.
    const r = report([earned({ deliveryFulfilledBy: 'platform' })]);
    expect(r.contributionInputs.find((i) => i.key === 'delivery_subsidy')!.status).toBe('not_recorded');
  });

  it('produces no contribution margin — four of eight terms is not a margin', () => {
    expect(report([earned()])).not.toHaveProperty('contributionMargin');
  });
});
