/**
 * Sub-order lifecycle.
 *
 * Pattern — State, expressed as an explicit transition table
 * (ENGINEERING_PRINCIPLES §4).
 *
 * A multi-seller cart produces one order and N sub-orders. Each sub-order runs
 * its own state machine with its own SLA clocks. A `status` switch scattered
 * across route handlers and components is how marketplaces lose money, so every
 * legal move lives in one table, is guarded once, and is exhaustively tested.
 *
 *   placed → awaiting_seller → confirmed → dispatched → delivered
 *                  ↓               ↓            ↓           ↓
 *              rejected        cancelled     refused    returned
 *
 * Every transition records actor, timestamp and — where the founding pack
 * requires it — a coded reason. Doc 06 §7 forbids generic reasons, because the
 * cost of a failed delivery has to be allocated to a documented party.
 */
import { InvalidTransition, ReasonCodeRequired, UnauthorisedActor } from '../errors/index';
import type { Clock } from '../ports/clock';

export const SUB_ORDER_STATES = [
  'placed',
  'awaiting_seller',
  'confirmed',
  'dispatched',
  'delivered',
  'rejected',
  'cancelled',
  'refused',
  'returned',
] as const;

export type SubOrderState = (typeof SUB_ORDER_STATES)[number];

export const ACTORS = ['system', 'seller', 'customer', 'platform', 'courier'] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * Controlled vocabularies. Free text where an enum belongs is a bug
 * (CLAUDE.md §4), and these specific codes feed cost allocation and the
 * seller performance record.
 */
export const REJECTION_REASONS = [
  'out_of_stock',
  'pricing_error',
  'area_not_served',
  'suspected_fraud',
] as const;

export const CANCELLATION_REASONS = [
  'customer_request',
  'platform_policy',
  'payment_failed',
  'seller_unresponsive',
] as const;

export const REFUSAL_REASONS = [
  'customer_refused',
  'customer_unreachable',
  'address_invalid',
  'payment_not_ready',
] as const;

export const RETURN_REASONS = [
  'damaged_in_transit',
  'wrong_item',
  'not_as_described',
  'defective',
  'changed_mind',
] as const;

export type ReasonCode =
  | (typeof REJECTION_REASONS)[number]
  | (typeof CANCELLATION_REASONS)[number]
  | (typeof REFUSAL_REASONS)[number]
  | (typeof RETURN_REASONS)[number];

interface TransitionRule {
  readonly from: SubOrderState;
  readonly to: SubOrderState;
  readonly actors: readonly Actor[];
  readonly reasonRequired: boolean;
  readonly reasons?: readonly ReasonCode[];
}

/** The single source of truth for what may happen to a sub-order. */
export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'placed', to: 'awaiting_seller', actors: ['system'], reasonRequired: false },

  { from: 'awaiting_seller', to: 'confirmed', actors: ['seller'], reasonRequired: false },
  {
    from: 'awaiting_seller',
    to: 'rejected',
    actors: ['seller'],
    reasonRequired: true,
    reasons: REJECTION_REASONS,
  },
  {
    from: 'awaiting_seller',
    to: 'cancelled',
    actors: ['customer', 'platform'],
    reasonRequired: true,
    reasons: CANCELLATION_REASONS,
  },

  { from: 'confirmed', to: 'dispatched', actors: ['seller'], reasonRequired: false },
  {
    from: 'confirmed',
    to: 'cancelled',
    actors: ['customer', 'platform'],
    reasonRequired: true,
    reasons: CANCELLATION_REASONS,
  },

  { from: 'dispatched', to: 'delivered', actors: ['courier', 'platform'], reasonRequired: false },
  {
    from: 'dispatched',
    to: 'refused',
    actors: ['courier', 'platform'],
    reasonRequired: true,
    reasons: REFUSAL_REASONS,
  },

  {
    from: 'delivered',
    to: 'returned',
    actors: ['customer', 'platform'],
    reasonRequired: true,
    reasons: RETURN_REASONS,
  },
];

/** States from which nothing further may happen. */
export const TERMINAL_STATES: readonly SubOrderState[] = [
  'rejected',
  'cancelled',
  'refused',
  'returned',
];

/**
 * States that count as a completed sale.
 *
 * Doc 03 §8: commission is charged only on completed orders. A returned order
 * has its commission reversed, which is why `returned` is not in this list.
 */
export const COMPLETED_STATES: readonly SubOrderState[] = ['delivered'];

export interface TransitionCommand {
  readonly to: SubOrderState;
  readonly actor: Actor;
  readonly reason?: ReasonCode;
}

/** Append-only audit record produced by every successful move. */
export interface TransitionRecord {
  readonly from: SubOrderState;
  readonly to: SubOrderState;
  readonly actor: Actor;
  readonly reason: ReasonCode | null;
  readonly at: Date;
}

export class SubOrderLifecycle {
  static isTerminal(state: SubOrderState): boolean {
    return TERMINAL_STATES.includes(state);
  }

  static isCompleted(state: SubOrderState): boolean {
    return COMPLETED_STATES.includes(state);
  }

  /** Every state reachable from here, ignoring actor and reason. */
  static allowedFrom(state: SubOrderState): SubOrderState[] {
    return TRANSITIONS.filter((t) => t.from === state).map((t) => t.to);
  }

  static rule(from: SubOrderState, to: SubOrderState): TransitionRule | undefined {
    return TRANSITIONS.find((t) => t.from === from && t.to === to);
  }

  /**
   * Attempt a transition.
   *
   * Throws a typed domain error rather than returning false, so an illegal move
   * cannot be ignored by a caller that forgot to check a boolean.
   */
  static transition(
    from: SubOrderState,
    command: TransitionCommand,
    clock: Clock,
  ): TransitionRecord {
    const rule = SubOrderLifecycle.rule(from, command.to);
    if (!rule) {
      throw new InvalidTransition(from, command.to);
    }
    if (!rule.actors.includes(command.actor)) {
      throw new UnauthorisedActor(command.actor, `${from} → ${command.to}`);
    }
    if (rule.reasonRequired) {
      if (!command.reason) {
        throw new ReasonCodeRequired(command.to);
      }
      if (rule.reasons && !rule.reasons.includes(command.reason)) {
        throw new ReasonCodeRequired(command.to);
      }
    }

    return {
      from,
      to: command.to,
      actor: command.actor,
      reason: command.reason ?? null,
      at: clock.now(),
    };
  }

  /**
   * Whether a review may be created.
   *
   * Acceptance gate 5: only a delivered sub-order can produce a verified-purchase
   * review. Mirrored as a database constraint — this is the readable half of the
   * same rule, not its only enforcement.
   */
  static canProduceReview(state: SubOrderState): boolean {
    return state === 'delivered';
  }

  /**
   * Whether this sub-order should attract commission.
   *
   * Doc 03 §8 — completed orders only. Refused, rejected, cancelled and returned
   * sub-orders do not, and a return reverses a fee already charged.
   */
  static attractsCommission(state: SubOrderState): boolean {
    return SubOrderLifecycle.isCompleted(state);
  }
}
