/**
 * Port: returns.
 *
 * Same shape as the review port, for the same reason: a guest has no account,
 * so the only identity they hold is the order reference and the phone the order
 * was placed on. Every write here takes those two factors and a LINE ITEM, and
 * derives the sub-order and the customer inside the query. Nothing about
 * identity comes from the request.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT DECIDE. It returns the raw facts a
 * return depends on — when the parcel arrived, what the listing's policy says,
 * whether one has already been asked for — and the DOMAIN decides from them.
 * A repository that returned `canReturn: true` would be a second place where
 * the fourteen-day window is defined, and the first one to be wrong.
 */
import type { CostBearer, ReturnEligibility, ReturnReason, ReturnState } from '../trust/return-request';
import type { Money } from '../value-objects/money';

/** A line item on a delivered parcel, with everything the domain needs to rule. */
export interface ReturnableLine {
  readonly lineItemId: string;
  readonly subOrderId: string;
  readonly subOrderReference: string;
  readonly productName: string;
  readonly brandName: string;
  readonly volumeMl: number;
  readonly quantity: number;
  readonly unitPrice: Money;
  /** Null when the parcel has not arrived. The domain treats that separately. */
  readonly deliveredAt: Date | null;
  /** The LISTING's policy, which governs a change of mind and nothing else. */
  readonly eligibility: ReturnEligibility | null;
  /** One request per line item. A second is refused, not queued. */
  readonly alreadyRequested: boolean;
}

/** A return as a house or an operator sees it. */
export interface ReturnRecord {
  readonly id: string;
  readonly subOrderId: string;
  readonly subOrderReference: string;
  readonly sellerId: string;
  readonly brandName: string;
  readonly lineItemId: string | null;
  readonly productName: string | null;
  readonly state: ReturnState;
  readonly reason: ReturnReason;
  readonly customerNote: string | null;
  readonly costBearer: CostBearer;
  readonly refund: Money | null;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface ReturnRepository {
  /**
   * Every line this order could ask to return, with the facts, unjudged.
   *
   * Empty for a wrong phone exactly as for an unknown reference.
   */
  listReturnable(input: {
    readonly reference: string;
    readonly phone: string;
  }): Promise<readonly ReturnableLine[]>;

  /**
   * Ask for a return. Null when those two factors do not own that line item, or
   * one has already been asked for.
   *
   * The cost bearer is passed IN rather than decided here: it comes from the
   * domain's `proposedCostBearer`, and a repository that computed it would be a
   * second copy of the rule that decides who pays.
   */
  request(input: {
    readonly reference: string;
    readonly phone: string;
    readonly lineItemId: string;
    readonly reason: ReturnReason;
    readonly note: string;
    readonly costBearer: CostBearer;
    readonly now: Date;
  }): Promise<{ readonly id: string } | null>;

  /** What this order has already asked for. Read with the same two factors. */
  listForOrder(input: {
    readonly reference: string;
    readonly phone: string;
  }): Promise<readonly ReturnRecord[]>;

  /** The house's own returns queue. */
  listForSeller(sellerId: string): Promise<readonly ReturnRecord[]>;

  /** Everything, for the operations console. */
  listAll(input: { readonly limit: number }): Promise<readonly ReturnRecord[]>;

  findById(id: string): Promise<ReturnRecord | null>;

  /**
   * Move a return.
   *
   * The state machine is applied by the caller (domain) and the row is written
   * here — the same division `applyTransition` uses for a sub-order. The
   * `expectedFrom` guard makes the write conditional on the state the caller
   * decided against, so two operators clicking at once cannot both succeed.
   */
  move(input: {
    readonly id: string;
    readonly expectedFrom: ReturnState;
    readonly to: ReturnState;
    readonly decidedBy: string;
    readonly costBearer?: CostBearer;
    readonly refundPiastres?: number;
    readonly now: Date;
  }): Promise<boolean>;
}
