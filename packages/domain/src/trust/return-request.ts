/**
 * Returns.
 *
 * The product page has stated a returns policy since the first version of this
 * site, and there has never been a way for a customer to act on it. A policy
 * with no mechanism is a policy the customer discovers is decorative at the
 * worst possible moment.
 *
 * THREE RULES DO THE WORK HERE, and none of them is arbitrary.
 *
 * 1. A FAULT IS ALWAYS RETURNABLE. Egypt's Consumer Protection Law 181/2018
 *    gives the buyer a remedy for a good that is defective, damaged, or not
 *    what was described, and no seller policy can waive it. So the listing's
 *    own `return_eligibility` governs a CHANGE OF MIND and nothing else. A
 *    house that sets "not returnable" is saying "no returns because you
 *    changed your mind" — it is not saying "we may send you a broken bottle".
 *
 * 2. PERFUME IS A HYGIENE PRODUCT. An opened bottle cannot go back into stock,
 *    which is exactly what `sealed_only` means and why it is the sensible
 *    default. That is a real constraint on a real business, not a way of
 *    refusing people.
 *
 * 3. WHO PAYS FOLLOWS FROM WHY. Doc 06 §7: "No generic reason allowed. Cost
 *    allocation depends on these." The reason a customer picks determines the
 *    proposed cost bearer, so the allocation cannot be quietly decided later by
 *    whoever is annoyed. An operator may override it, and the override is a
 *    visible act rather than the absence of a rule.
 */
import { InvalidTransition } from '../errors/index';
import { RETURN_REASONS } from '../state-machines/sub-order';
import type { ReturnEligibility } from '../catalogue/vocabularies';

export type ReturnReason = (typeof RETURN_REASONS)[number];

/**
 * The reasons that are somebody's FAULT rather than somebody's preference.
 *
 * Always permitted, whatever the listing says. See rule 1.
 */
export const FAULT_REASONS: readonly ReturnReason[] = [
  'damaged_in_transit',
  'wrong_item',
  'not_as_described',
  'defective',
];

export const isFault = (reason: ReturnReason): boolean => FAULT_REASONS.includes(reason);

/*
 * What a listing's own policy says about a change of mind.
 *
 * IMPORTED, not redeclared. The vocabulary already exists — a listing's editor
 * offers it — and a second copy here would export the same name twice from the
 * barrel, which is a TS2308 the first time and a silent divergence the second.
 * `ScentFamily` taught this lesson already.
 */
export type { ReturnEligibility } from '../catalogue/vocabularies';

/**
 * How long after delivery a return may be asked for.
 *
 * FOURTEEN DAYS for a change of mind — the distance-selling period in Egyptian
 * consumer law, stated here as a named constant so nobody has to guess whether
 * the number in the copy and the number in the code are the same one.
 *
 * THIRTY for a fault, which is our own policy and deliberately longer: a
 * defect in a fragrance often shows up on the third wearing rather than the
 * first, and a house that has genuinely sent out a bad bottle is not helped by
 * a customer discovering it on day fifteen and telling everybody instead.
 */
export const CHANGE_OF_MIND_DAYS = 14;
export const FAULT_WINDOW_DAYS = 30;

export const windowDaysFor = (reason: ReturnReason): number =>
  (isFault(reason) ? FAULT_WINDOW_DAYS : CHANGE_OF_MIND_DAYS);

/**
 * Which reasons this listing accepts.
 *
 * The fault reasons are in every list. What varies is whether a change of mind
 * is one of them.
 */
export function permittedReasons(
  eligibility: ReturnEligibility | null,
): readonly ReturnReason[] {
  // Null means a listing published before the field was required. Treated as
  // the strictest setting rather than the most generous: inventing a returns
  // promise on a house's behalf commits somebody else's money.
  const changeOfMind = eligibility === 'sealed_only' || eligibility === 'sealed_or_defect';
  return changeOfMind ? RETURN_REASONS : FAULT_REASONS;
}

export type ReturnObjection =
  | 'reason_not_permitted'
  | 'window_closed'
  | 'not_delivered'
  | 'already_requested'
  | 'note_required';

/**
 * Whether this return can be asked for, and EVERY reason it cannot.
 *
 * All of them rather than the first, as everywhere else here: somebody who
 * fixes one fault and is immediately shown the next stops trusting the form.
 */
export function objectionsToRequesting(input: {
  readonly reason: ReturnReason;
  readonly eligibility: ReturnEligibility | null;
  readonly deliveredAt: Date | null;
  readonly alreadyRequested: boolean;
  readonly note: string;
  readonly now: Date;
}): ReturnObjection[] {
  const objections: ReturnObjection[] = [];

  if (!permittedReasons(input.eligibility).includes(input.reason)) {
    objections.push('reason_not_permitted');
  }

  if (input.deliveredAt === null) {
    // Nothing has arrived, so there is nothing to send back. Distinct from a
    // closed window: the customer's next step is to wait, not to give up.
    objections.push('not_delivered');
  } else {
    const days = (input.now.getTime() - input.deliveredAt.getTime()) / 86_400_000;
    if (days > windowDaysFor(input.reason)) objections.push('window_closed');
  }

  if (input.alreadyRequested) objections.push('already_requested');

  /*
   * A written note, always.
   *
   * The reason code drives cost allocation and the house's performance record,
   * and a bare code tells a house nothing it can act on — "defective" could be
   * a cracked atomiser or a scent that turned. The house has to pack, collect
   * and inspect, and it deserves a sentence saying what it is looking for.
   */
  if (input.note.trim().length === 0) objections.push('note_required');

  return objections;
}

/** Who the platform proposes should bear the cost, before anybody argues. */
export type CostBearer = 'seller' | 'platform' | 'customer' | 'courier' | 'unallocated';

/**
 * The proposed allocation, from the reason alone.
 *
 * A PROPOSAL, not a verdict — the row starts here and an operator may move it
 * when they see the evidence. What matters is that it never starts at
 * `unallocated` and drift into whoever complains least: doc 03 §4 makes failed
 * delivery and returns the largest single cost line in this business, and a
 * cost with no owner is a cost the platform silently absorbs.
 */
export function proposedCostBearer(reason: ReturnReason): CostBearer {
  switch (reason) {
    // The parcel left the house intact and arrived broken. That is the
    // courier's, and it is recoverable from them under the carriage contract.
    case 'damaged_in_transit':
      return 'courier';
    // The house picked, described or made it. All three are the house's.
    case 'wrong_item':
    case 'not_as_described':
    case 'defective':
      return 'seller';
    // Nothing went wrong. Somebody still has to pay the courier twice.
    case 'changed_mind':
      return 'customer';
  }
}

/* --------------------------------------------------------- the state machine */

export const RETURN_STATES = [
  'requested', 'approved', 'declined', 'in_transit', 'received', 'refunded', 'closed',
] as const;

export type ReturnState = (typeof RETURN_STATES)[number];

/** Who may move a return. A customer asks; they do not decide. */
export type ReturnActor = 'customer' | 'seller' | 'platform' | 'courier';

interface ReturnTransition {
  readonly from: ReturnState;
  readonly to: ReturnState;
  readonly actors: readonly ReturnActor[];
}

/**
 * What may happen to a return.
 *
 * The shape mirrors `SubOrderLifecycle` deliberately — one table, one place,
 * read by a person before it is executed by a machine.
 *
 * NOTE WHAT IS ABSENT. There is no `requested → refunded`. A refund is only
 * reachable through `received`, which means somebody physically had the bottle
 * in their hands before money moved. Refunding on a promise is how a marketplace
 * funds a fraud ring, and the gap in this table is what stops it.
 */
export const RETURN_TRANSITIONS: readonly ReturnTransition[] = [
  { from: 'requested', to: 'approved', actors: ['seller', 'platform'] },
  { from: 'requested', to: 'declined', actors: ['seller', 'platform'] },
  // A customer may withdraw their own request before anybody has acted.
  { from: 'requested', to: 'closed', actors: ['customer', 'platform'] },

  { from: 'approved', to: 'in_transit', actors: ['courier', 'seller', 'platform'] },
  // Approved and then never sent back. Closed by time, not by a decision.
  { from: 'approved', to: 'closed', actors: ['platform'] },

  { from: 'in_transit', to: 'received', actors: ['seller', 'platform'] },
  { from: 'received', to: 'refunded', actors: ['platform'] },
  { from: 'received', to: 'closed', actors: ['platform'] },

  { from: 'refunded', to: 'closed', actors: ['platform'] },
  { from: 'declined', to: 'closed', actors: ['platform'] },
];

export const ReturnLifecycle = {
  rule(from: ReturnState, to: ReturnState): ReturnTransition | undefined {
    return RETURN_TRANSITIONS.find((t) => t.from === from && t.to === to);
  },

  can(from: ReturnState, to: ReturnState, actor: ReturnActor): boolean {
    const rule = ReturnLifecycle.rule(from, to);
    return rule !== undefined && rule.actors.includes(actor);
  },

  /** Throws rather than returning false: an illegal move is a bug, not a no. */
  assert(from: ReturnState, to: ReturnState, actor: ReturnActor): void {
    if (!ReturnLifecycle.can(from, to, actor)) {
      throw new InvalidTransition(from, to, 'return');
    }
  },

  /** Nothing further may happen. */
  isTerminal(state: ReturnState): boolean {
    return state === 'closed';
  },

  /**
   * Whether money may move.
   *
   * The single sentence this whole table exists to make true: a refund requires
   * the bottle to have come back.
   */
  canRefund(state: ReturnState): boolean {
    return state === 'received';
  },
};
