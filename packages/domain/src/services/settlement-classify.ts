/**
 * What a sub-order is worth to a payout, right now.
 *
 * WHY THIS IS ITS OWN MODULE. It was a private method on `SettlementService`,
 * which was fine while exactly one thing needed to know whether an order was
 * "completed". The owner's dashboard needs to know too, and
 * `docs/ANALYTICS_DEFINITIONS.md` rule 1 says it must be the SAME answer: a
 * house is paid on one definition of completed, and an owner reading another
 * is the contradictory dashboard doc 04 §6 exists to prevent.
 *
 * The alternative — the dashboard re-deriving "delivered, remitted and past the
 * reserve" in its own words — works on the day it is written and drifts the
 * first time a hold reason is added here. One function, two callers.
 *
 * Pure: no clock. The caller says WHEN it is asking — a payout asks as of its
 * period end, the dashboard as of now — and the answer depends on nothing else.
 */
import type { SettlementSubOrder } from './settlement';

export type LineOutcome = 'earned' | 'reversed' | 'excluded' | 'held';

export type HoldReason =
  | 'within_reserve_period'
  | 'cash_not_remitted'
  | 'payment_not_captured'
  | 'return_window_open';

export interface SettlementClassification {
  readonly outcome: LineOutcome;
  readonly holdReason?: HoldReason;
  /** Plain-language justification, so a statement can be read without support. */
  readonly explanation: string;
}

const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

export function classifyForSettlement(
  s: SettlementSubOrder,
  asOf: Date,
  reserveDays: number,
): SettlementClassification {
  // Nothing was ever sold: no gross, no fee, no cost to the house.
  if (['placed', 'awaiting_seller', 'confirmed', 'dispatched'].includes(s.state)) {
    return { outcome: 'excluded', explanation: 'الطلب لم يكتمل بعد — لا يدخل هذا الكشف' };
  }
  if (s.state === 'rejected') {
    return { outcome: 'excluded', explanation: 'اعتذرت الدار — لا عمولة ولا مستحقات' };
  }
  if (s.state === 'cancelled') {
    return { outcome: 'excluded', explanation: 'أُلغي الطلب — لا عمولة ولا مستحقات' };
  }
  if (s.state === 'refused') {
    // Refused at the door: no sale, so no commission. Shipping cost is a real
    // loss but is allocated through an adjustment, never silently netted here.
    return { outcome: 'excluded', explanation: 'رُفض الاستلام — لا عمولة؛ تكلفة الشحن تُسوّى بقيد منفصل' };
  }
  if (s.state === 'returned') {
    return { outcome: 'reversed', explanation: 'مُرتجع — تُعكس قيمة الطلب وتُردّ العمولة بالكامل' };
  }

  // Delivered. Eligible only if the money is real and the reserve has passed.
  if (!s.cashInHand) {
    return {
      outcome: 'held',
      holdReason: 'cash_not_remitted',
      explanation: 'سُلّم — بانتظار تحويل شركة الشحن للمبلغ',
    };
  }
  const releaseAt = addDays(s.deliveredAt ?? asOf, reserveDays);
  if (releaseAt > asOf) {
    return {
      outcome: 'held',
      holdReason: 'within_reserve_period',
      explanation: 'سُلّم — ما زال داخل فترة الإرجاع',
    };
  }
  return { outcome: 'earned', explanation: 'مكتمل — مستحق' };
}
