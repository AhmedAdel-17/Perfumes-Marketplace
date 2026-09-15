/**
 * Port: the facts the owner's report is computed from.
 *
 * ONE READ, NOT A QUERY PER TILE. The report is a projection over a period —
 * `buildOwnerReport` in `insights/owner-metrics.ts` — and the projection is
 * pure. This port's only job is to hand it the facts, shaped for the domain,
 * so no rule about what "completed" or "late" means ever lives in SQL.
 *
 * WHAT IT MUST NOT DO is judge anything. It does not decide which orders are
 * completed, which deadlines were missed, or what a rate is. An adapter that
 * returned "completed orders" would be a second definition of completed, and
 * the owner's GMV would be free to drift from what houses are paid.
 *
 * THE PERIOD. Sub-orders, discounts and platform-borne refunds are the COHORT
 * placed in `[from, to)`: a refund belongs to the period its order was placed
 * in, so a stage-to-stage conversion never divides one period's orders by
 * another period's outcomes. Support tickets are counted by when they were
 * opened, because a ticket is not always about an order. The caller chooses the
 * boundaries — Cairo midnights, per ANALYTICS_DEFINITIONS rule 4.
 *
 * Platform-only by its nature: it reads across every house.
 */
import type { Money } from '../value-objects/money';
import type { OwnerReportSubOrder } from '../insights/owner-metrics';

export interface ReportPeriod {
  /** Inclusive. */
  readonly from: Date;
  /** Exclusive. */
  readonly to: Date;
}

export interface OwnerReportFacts {
  readonly subOrders: readonly OwnerReportSubOrder[];
  /** Σ `returns.refund_piastres` where the platform bears the cost, for the cohort. */
  readonly platformRefunds: Money;
  /** Support tickets opened within the period. */
  readonly ticketCount: number;
  /** Σ `orders.discount_piastres` for the cohort. */
  readonly discounts: Money;
}

export interface OwnerReportRepository {
  facts(period: ReportPeriod): Promise<OwnerReportFacts>;
}
