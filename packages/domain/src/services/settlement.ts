/**
 * Settlement — turning a period of sub-orders into a payout statement.
 *
 * Pattern — Builder, over pure inputs (ENGINEERING_PRINCIPLES §4).
 *
 * This is acceptance gate 4, which DATA_MODEL.md calls "the hardest thing in the
 * MVP. Test it first, not last." Cancelled, refused, returned and failed-payment
 * sub-orders each settle differently, and a statement that does not reconcile
 * destroys the seller trust the whole commission model depends on.
 *
 * Two rules govern everything below:
 *
 *  1. Commission is charged only on COMPLETED orders (doc 03 §8). A return
 *     reverses a fee already charged; a refusal never earns one.
 *  2. Never pay faster than you are paid. A sub-order is eligible only once it
 *     has cleared the reserve period AND the cash is actually in hand — which
 *     for COD means the courier has remitted (doc 03 §10).
 *
 * The ledger produced here is deliberately independent of WHO holds the cash.
 * D-5 decides settlement, not accounting: what is owed to whom is identical
 * whether the platform pays the house or invoices it.
 */
import { Money, sumMoney, type BasisPoints } from '../value-objects/money';
import { CommissionPolicy, type OrderSource } from '../policies/commission';
import { SubOrderLifecycle, type SubOrderState } from '../state-machines/sub-order';
import type { Clock } from '../ports/clock';
import { classifyForSettlement, type HoldReason, type LineOutcome } from './settlement-classify';

/*
 * The classification itself lives in `settlement-classify.ts`, shared with the
 * owner's report — one definition of "earned" for a payout and a dashboard.
 * Re-exported here so every existing import of these names keeps working.
 */
export type { HoldReason, LineOutcome } from './settlement-classify';

/**
 * Who books and pays the courier — and therefore who receives the delivery fee.
 *
 * Snapshotted per sub-order, like the commission rate, so changing a house's
 * arrangement tomorrow cannot rewrite what it was owed for an order it shipped
 * last month.
 */
export type DeliveryFulfilledBy = 'seller' | 'platform';

export interface SettlementSubOrder {
  readonly id: string;
  readonly reference: string;
  readonly state: SubOrderState;
  readonly merchandise: Money;
  readonly shipping: Money;
  /** Snapshotted at purchase. Never recomputed from today's rates. */
  readonly commissionSource: OrderSource;
  readonly commissionBps: BasisPoints;
  readonly deliveredAt?: Date;
  /** COD: the courier has remitted. Card: the payment captured. */
  readonly cashInHand: boolean;
  /** Snapshotted at placement. Decides whether shipping is reimbursed. */
  readonly deliveryFulfilledBy: DeliveryFulfilledBy;
}

export interface SettlementAdjustment {
  readonly id: string;
  readonly amount: Money;
  readonly reason: string;
}

export interface SettlementInput {
  readonly sellerId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly subOrders: readonly SettlementSubOrder[];
  readonly adjustments: readonly SettlementAdjustment[];
  /** Days after delivery before money may leave. Per-seller policy value. */
  readonly reserveDays: number;
  readonly disputeWindowDays: number;
}

export interface StatementLine {
  readonly subOrderId: string;
  readonly reference: string;
  readonly outcome: LineOutcome;
  readonly state: SubOrderState;
  readonly gross: Money;
  readonly commission: Money;
  readonly shipping: Money;
  readonly net: Money;
  readonly commissionSource: OrderSource;
  readonly commissionBps: BasisPoints;
  readonly holdReason?: HoldReason;
  /** Plain-language justification, so a statement can be read without support. */
  readonly explanation: string;
}

export interface PayoutStatement {
  readonly sellerId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly lines: readonly StatementLine[];
  readonly gross: Money;
  readonly commission: Money;
  readonly shipping: Money;
  readonly adjustments: Money;
  readonly net: Money;
  /** What the house actually feels, in basis points. */
  readonly effectiveRateBps: BasisPoints;
  readonly heldGross: Money;
  readonly disputeDeadline: Date;
  readonly generatedAt: Date;
}

const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

export class SettlementService {
  constructor(private readonly clock: Clock) {}

  build(input: SettlementInput): PayoutStatement {
    const lines: StatementLine[] = input.subOrders.map((s) => {
      const { outcome, holdReason, explanation } = classifyForSettlement(
        s,
        input.periodEnd,
        input.reserveDays,
      );

      const snapshot = { source: s.commissionSource, bps: s.commissionBps, ruleSetVersion: 0 };
      const fullCommission = CommissionPolicy.charge(s.merchandise, snapshot);

      let gross = Money.zero();
      let commission = Money.zero();
      let shipping = Money.zero();

      // `shipping` on a statement line means the delivery fee REIMBURSED to
      // this house: what the customer paid, passed through when the house
      // booked the courier, and zero when the marketplace booked it. One
      // definition for both arrangements, so `net` needs no branch.
      const reimbursable = s.deliveryFulfilledBy === 'seller' ? s.shipping : Money.zero();

      if (outcome === 'earned') {
        gross = s.merchandise;
        commission = fullCommission;
        shipping = reimbursable;
      } else if (outcome === 'reversed') {
        // The sale is undone: gross comes back off and the fee is refunded in
        // full (doc 03 §8 — commission only on completed orders). The delivery
        // reimbursement comes back off too, because the parcel still travelled
        // and the house still paid for it — reclaiming the fee would charge the
        // house for a return it did not cause. See the note on the reversal
        // test: this is a deliberate position, not an oversight.
        gross = s.merchandise.negated();
        commission = fullCommission.negated();
        shipping = Money.zero();
      }

      return {
        subOrderId: s.id,
        reference: s.reference,
        outcome,
        state: s.state,
        gross,
        commission,
        shipping,
        // gross MINUS commission. Shipping is carried on the line as
        // information — what the delivery cost was — and is NOT deducted.
        //
        // It was deducted, and that was a double charge. The customer pays the
        // delivery fee at checkout and it goes to the marketplace, so the house
        // never receives it; subtracting it again took the fee out of the
        // house's merchandise revenue as well. On a 380 EGP order with 55 EGP
        // delivery, every house was underpaid by 55.
        //
        // Caught by the database: `payout_lines_net_reconciles` in 0001 asserts
        // `net = gross - commission`, and refused the row. Two layers holding
        // the same rule disagreed, and the one with the CHECK constraint won.
        net: gross.minus(commission).plus(shipping),
        commissionSource: s.commissionSource,
        commissionBps: s.commissionBps,
        ...(holdReason ? { holdReason } : {}),
        explanation,
      };
    });

    const gross = sumMoney(lines.map((l) => l.gross));
    const commission = sumMoney(lines.map((l) => l.commission));
    const shipping = sumMoney(lines.map((l) => l.shipping));
    const adjustments = sumMoney(input.adjustments.map((a) => a.amount));
    const net = gross.minus(commission).plus(shipping).plus(adjustments);

    const heldGross = sumMoney(
      input.subOrders.filter((s, i) => lines[i]!.outcome === 'held').map((s) => s.merchandise),
    );

    // Effective rate is measured on EARNED gross only. Including reversals would
    // flatter the number, and the point of showing it is honesty.
    const earnedGross = sumMoney(lines.filter((l) => l.outcome === 'earned').map((l) => l.gross));
    const earnedCommission = sumMoney(
      lines.filter((l) => l.outcome === 'earned').map((l) => l.commission),
    );

    return {
      sellerId: input.sellerId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lines,
      gross,
      commission,
      shipping,
      adjustments,
      net,
      effectiveRateBps: CommissionPolicy.effectiveRateBps(earnedGross, earnedCommission),
      heldGross,
      disputeDeadline: addDays(input.periodEnd, input.disputeWindowDays),
      generatedAt: this.clock.now(),
    };
  }

  /**
   * Independent verification that a statement adds up.
   *
   * Called before a payout is written, so a statement that does not reconcile
   * can never reach a seller. It recomputes from the lines rather than trusting
   * the totals it was handed.
   */
  static reconciles(statement: PayoutStatement): boolean {
    const gross = sumMoney(statement.lines.map((l) => l.gross));
    const commission = sumMoney(statement.lines.map((l) => l.commission));
    const shipping = sumMoney(statement.lines.map((l) => l.shipping));
    const net = gross.minus(commission).plus(shipping).plus(statement.adjustments);

    return (
      gross.equals(statement.gross) &&
      commission.equals(statement.commission) &&
      // Shipping is REIMBURSED, not deducted — the house booked the courier
      // and paid for it, so the fee the customer paid passes through.
      shipping.equals(statement.shipping) &&
      net.equals(statement.net) &&
      statement.lines.every((l) => l.net.equals(l.gross.minus(l.commission).plus(l.shipping))) &&
      // Nothing that did not complete may carry a fee.
      statement.lines.every(
        (l) =>
          l.outcome === 'earned' ||
          l.outcome === 'reversed' ||
          (l.commission.isZero() && l.gross.isZero()),
      ) &&
      // Every earned line must be on a state that actually attracts commission.
      statement.lines.every(
        (l) => l.outcome !== 'earned' || SubOrderLifecycle.attractsCommission(l.state),
      )
    );
  }
}
