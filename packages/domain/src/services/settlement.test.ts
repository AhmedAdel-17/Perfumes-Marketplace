/**
 * Acceptance gate 4.
 *
 * "Cancelled, refused, returned and failed-payment states must reconcile
 * correctly." DATA_MODEL.md calls this the hardest thing in the MVP and says to
 * test it first. Every case below is a way a statement could quietly be wrong.
 */
import { describe, expect, it } from 'vitest';
import { Money, sumMoney } from '../value-objects/money';
import { FixedClock } from '../ports/clock';
import { SettlementService, type SettlementSubOrder, type SettlementInput } from './settlement';

const PERIOD_START = new Date('2026-08-18T00:00:00Z');
const PERIOD_END = new Date('2026-08-31T23:59:59Z');
const clock = () => new FixedClock(new Date('2026-09-01T09:00:00Z'));

const egp = (v: string) => Money.fromMajorString(v);
const daysBeforeEnd = (n: number) => new Date(PERIOD_END.getTime() - n * 86_400_000);

let seq = 0;
const sub = (o: Partial<SettlementSubOrder> = {}): SettlementSubOrder => ({
  id: `s${++seq}`,
  reference: `DY-${1000 + seq}-A`,
  state: 'delivered',
  merchandise: egp('1000'),
  shipping: egp('45'),
  commissionSource: 'storefront_referral',
  commissionBps: 500,
  deliveredAt: daysBeforeEnd(10),
  cashInHand: true,
  ...o,
});

const build = (subOrders: SettlementSubOrder[], adjustments: SettlementInput['adjustments'] = []) =>
  new SettlementService(clock()).build({
    sellerId: 'dar-al-ward',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    subOrders,
    adjustments,
    reserveDays: 7,
    disputeWindowDays: 7,
  });

describe('the seller statement from design-reference/seller.html', () => {
  it('reproduces it exactly, from the domain rather than by hand', () => {
    const st = build([
      sub({ merchandise: egp('1520'), commissionSource: 'storefront_referral', commissionBps: 500, shipping: egp('0') }),
      sub({ merchandise: egp('620'), commissionSource: 'organic_search', commissionBps: 1500, shipping: egp('0') }),
      sub({ merchandise: egp('900'), commissionSource: 'storefront_referral', commissionBps: 500, shipping: egp('0') }),
      sub({ merchandise: egp('1240'), commissionSource: 'storefront_referral', commissionBps: 500, shipping: egp('0') }),
    ], [{ id: 'a1', amount: egp('-225'), reason: 'الشحن المحصّل للشركة' }]);

    expect(st.gross.toMajorString()).toBe('4280.00');
    expect(st.commission.toMajorString()).toBe('276.00');
    expect(st.net.toMajorString()).toBe('3779.00');
    expect(st.effectiveRateBps).toBe(645);          // 6.45% — "3 of 4 were yours"
    expect(SettlementService.reconciles(st)).toBe(true);
  });
});

describe('gate 4 — each failure state settles differently', () => {
  it('a REJECTED sub-order earns nothing and costs the house nothing', () => {
    const st = build([sub({ state: 'rejected' })]);
    expect(st.gross.isZero()).toBe(true);
    expect(st.commission.isZero()).toBe(true);
    expect(st.net.isZero()).toBe(true);
    expect(st.lines[0]!.outcome).toBe('excluded');
  });

  it('a CANCELLED sub-order is excluded entirely', () => {
    const st = build([sub({ state: 'cancelled' })]);
    expect(st.lines[0]!.outcome).toBe('excluded');
    expect(st.net.isZero()).toBe(true);
  });

  it('a REFUSED delivery earns no commission — there was no sale', () => {
    const st = build([sub({ state: 'refused' })]);
    expect(st.commission.isZero()).toBe(true);
    expect(st.gross.isZero()).toBe(true);
    expect(st.lines[0]!.explanation).toContain('رُفض الاستلام');
  });

  it('a RETURNED sub-order reverses the sale AND refunds the fee in full', () => {
    const st = build([sub({ state: 'returned', merchandise: egp('440'), commissionBps: 1500, shipping: egp('0') })]);
    expect(st.gross.toMajorString()).toBe('-440.00');
    expect(st.commission.toMajorString()).toBe('-66.00');   // the exact fee, reversed
    expect(st.net.toMajorString()).toBe('-374.00');
    expect(st.lines[0]!.outcome).toBe('reversed');
  });

  it('a delivered order whose cash has not arrived is HELD, not paid', () => {
    const st = build([sub({ cashInHand: false })]);
    expect(st.lines[0]!.outcome).toBe('held');
    expect(st.lines[0]!.holdReason).toBe('cash_not_remitted');
    expect(st.net.isZero()).toBe(true);
    expect(st.heldGross.toMajorString()).toBe('1000.00');
  });

  it('never pays faster than the reserve period permits', () => {
    const st = build([sub({ deliveredAt: daysBeforeEnd(2) })]);   // reserve is 7 days
    expect(st.lines[0]!.outcome).toBe('held');
    expect(st.lines[0]!.holdReason).toBe('within_reserve_period');
    expect(st.net.isZero()).toBe(true);
  });

  it('releases it once the reserve has cleared', () => {
    const st = build([sub({ deliveredAt: daysBeforeEnd(8) })]);
    expect(st.lines[0]!.outcome).toBe('earned');
    expect(st.net.toMajorString()).toBe('905.00');   // 1000 − 50 fee − 45 shipping
  });
});

describe('a mixed period — the realistic case', () => {
  const mixed = () => build(
    [
      sub({ merchandise: egp('1520'), shipping: egp('45') }),                       // earned
      sub({ merchandise: egp('620'), commissionBps: 1500, shipping: egp('50') }),   // earned
      sub({ state: 'returned', merchandise: egp('440'), commissionBps: 1500, shipping: egp('40') }),
      sub({ state: 'refused', merchandise: egp('300') }),
      sub({ state: 'rejected', merchandise: egp('700') }),
      sub({ state: 'cancelled', merchandise: egp('250') }),
      sub({ merchandise: egp('900'), cashInHand: false }),                          // held
      sub({ merchandise: egp('1100'), deliveredAt: daysBeforeEnd(1) }),             // held
    ],
    [{ id: 'adj', amount: egp('-90'), reason: 'تكلفة شحن مرتجع' }],
  );

  it('reconciles', () => {
    expect(SettlementService.reconciles(mixed())).toBe(true);
  });

  it('counts only what genuinely completed', () => {
    const st = mixed();
    const earned = st.lines.filter((l) => l.outcome === 'earned');
    const held = st.lines.filter((l) => l.outcome === 'held');
    const excluded = st.lines.filter((l) => l.outcome === 'excluded');
    const reversed = st.lines.filter((l) => l.outcome === 'reversed');
    expect([earned.length, held.length, excluded.length, reversed.length]).toEqual([2, 2, 3, 1]);
  });

  it('nets the reversal against the earnings without losing a piastre', () => {
    const st = mixed();
    // earned:   1520 + 620            = 2140
    // reversed: −440                  = 1700
    expect(st.gross.toMajorString()).toBe('1700.00');
    // fees:  76 + 93 − 66             = 103
    expect(st.commission.toMajorString()).toBe('103.00');
    // shipping: 45 + 50 − 40          = 55
    expect(st.shipping.toMajorString()).toBe('55.00');
    // net: 1700 − 103 − 55 − 90       = 1452
    expect(st.net.toMajorString()).toBe('1452.00');
  });

  it('reports the effective rate on EARNED business only, never flattered', () => {
    const st = mixed();
    // 169 / 2140 = 7.9%. Including the reversal would understate it.
    expect(st.effectiveRateBps).toBe(790);
  });

  it('surfaces what is being withheld and why', () => {
    const st = mixed();
    expect(st.heldGross.toMajorString()).toBe('2000.00');
    expect(st.lines.filter((l) => l.holdReason).map((l) => l.holdReason).sort())
      .toEqual(['cash_not_remitted', 'within_reserve_period']);
  });
});

describe('the statement cannot silently be wrong', () => {
  it('reconciles() recomputes rather than trusting the totals it was given', () => {
    const st = build([sub()]);
    const tampered = { ...st, net: egp('999999') };
    expect(SettlementService.reconciles(tampered)).toBe(false);
  });

  it('catches a fee attached to a line that never completed', () => {
    const st = build([sub({ state: 'refused' })]);
    const tampered = {
      ...st,
      lines: [{ ...st.lines[0]!, commission: egp('50') }],
    };
    expect(SettlementService.reconciles(tampered)).toBe(false);
  });

  it('every line net equals gross − commission − shipping', () => {
    const st = build([
      sub(), sub({ state: 'returned' }), sub({ state: 'refused' }), sub({ cashInHand: false }),
    ]);
    for (const l of st.lines) {
      expect(l.net.equals(l.gross.minus(l.commission).minus(l.shipping)), l.reference).toBe(true);
    }
  });

  it('totals equal the sum of the lines, always', () => {
    const st = build([sub(), sub({ state: 'returned' }), sub({ merchandise: egp('333.33') })]);
    expect(sumMoney(st.lines.map((l) => l.gross)).equals(st.gross)).toBe(true);
    expect(sumMoney(st.lines.map((l) => l.commission)).equals(st.commission)).toBe(true);
  });

  it('an empty period produces a zero statement, not a crash', () => {
    const st = build([]);
    expect(st.net.isZero()).toBe(true);
    expect(st.effectiveRateBps).toBe(0);
    expect(SettlementService.reconciles(st)).toBe(true);
  });
});

describe('dispute deadline', () => {
  it('is set from the period end, per the seller agreement', () => {
    const st = build([sub()]);
    expect(st.disputeDeadline.toISOString().slice(0, 10)).toBe('2026-09-07');
  });

  it('is generated at an injected time, never Date.now()', () => {
    expect(build([sub()]).generatedAt.toISOString()).toBe('2026-09-01T09:00:00.000Z');
  });
});
