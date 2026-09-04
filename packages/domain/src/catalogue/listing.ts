/**
 * The life of a listing.
 *
 * Pattern — State, as an explicit transition table. Third machine in this
 * codebase and the same reasoning each time: a `status` string compared in
 * route handlers is how a draft ends up on the shopfront.
 *
 *   draft → pending_moderation → published ⇄ suspended
 *     ↑            ↓                              ↓
 *     └────────────┘                          archived
 *
 * WHO MAY MOVE IT IS THE POINT. A house writes and submits; only the platform
 * publishes or suspends. That is not bureaucracy — doc 06 §4 puts the platform
 * between a listing and the shopfront because the trademark exposure of a bad
 * claim lands on the platform, not on the house that wrote it.
 *
 * `suspended` exists separately from `archived` because they mean different
 * things to a house: suspended is "we took this down and you can ask why",
 * archived is "you retired it". Collapsing them would make every takedown look
 * like the seller's own decision.
 */
import { InvalidTransition, UnauthorisedActor } from '../errors/index';

export const LISTING_STATES = [
  'draft',
  'pending_moderation',
  'published',
  'suspended',
  'archived',
] as const;

export type ListingState = (typeof LISTING_STATES)[number];

export const LISTING_ACTORS = ['seller', 'platform'] as const;
export type ListingActor = (typeof LISTING_ACTORS)[number];

interface Move {
  readonly to: ListingState;
  readonly by: readonly ListingActor[];
}

const TRANSITIONS: Readonly<Record<ListingState, readonly Move[]>> = {
  draft: [
    { to: 'pending_moderation', by: ['seller'] },
    { to: 'archived', by: ['seller', 'platform'] },
  ],
  pending_moderation: [
    // Sent back with a reason. Not "rejected" as a state: the listing returns
    // to the house's hands, which is where the fix happens.
    { to: 'draft', by: ['platform'] },
    { to: 'published', by: ['platform'] },
    // A house can withdraw a submission it has thought better of.
    { to: 'draft', by: ['seller'] },
  ],
  published: [
    { to: 'suspended', by: ['platform'] },
    { to: 'archived', by: ['seller', 'platform'] },
  ],
  suspended: [
    // Back to the queue, not straight back to the shopfront: whatever caused
    // the suspension has to be looked at again.
    { to: 'pending_moderation', by: ['seller'] },
    { to: 'archived', by: ['platform'] },
  ],
  archived: [
    { to: 'draft', by: ['seller', 'platform'] },
  ],
};

export function canMoveListing(
  from: ListingState, to: ListingState, actor: ListingActor,
): boolean {
  return (TRANSITIONS[from] ?? []).some((m) => m.to === to && m.by.includes(actor));
}

export function nextListingStates(
  from: ListingState, actor: ListingActor,
): ListingState[] {
  return [...new Set(
    (TRANSITIONS[from] ?? []).filter((m) => m.by.includes(actor)).map((m) => m.to),
  )];
}

/**
 * Why a listing was sent back or taken down.
 *
 * Coded, never free text — doc 06 §7. These feed the seller performance record
 * and tell the platform which houses need help rather than which need chasing,
 * and a thousand rows of "please fix" answer neither question.
 */
export const MODERATION_REASONS = [
  'prohibited_claim',
  'missing_required_fields',
  'unsupported_claim',
  'misleading_media',
  'implausible_pricing',
  'duplicate_listing',
  'restricted_ingredient',
] as const;

export type ModerationReason = (typeof MODERATION_REASONS)[number];

/** A takedown or a send-back always carries one. */
export function assertModerationReason(
  to: ListingState, reason: ModerationReason | null,
): asserts reason is ModerationReason {
  if ((to === 'draft' || to === 'suspended') && !reason) {
    throw new Error(`Moving a listing to ${to} requires a coded reason`);
  }
}

export interface ListingMove {
  readonly from: ListingState;
  readonly to: ListingState;
  readonly by: ListingActor;
  readonly reason: ModerationReason | null;
}

export function moveListing(
  from: ListingState,
  to: ListingState,
  actor: ListingActor,
  reason: ModerationReason | null = null,
): ListingMove {
  const legal = (TRANSITIONS[from] ?? []).find(
    (m) => m.to === to && m.by.includes(actor),
  );

  if (!legal) {
    // Distinguish "nobody may do this" from "you may not". A house told a move
    // is illegal when the real answer is that the platform has to do it will
    // file a support ticket about a bug that is not one.
    const anyone = (TRANSITIONS[from] ?? []).some((m) => m.to === to);
    if (anyone) throw new UnauthorisedActor(actor, `move a listing ${from} → ${to}`);
    throw new InvalidTransition(from, to, 'listing');
  }

  // A send-back or a suspension is a decision about somebody's product, and a
  // decision without a recorded reason cannot be reviewed, appealed or counted.
  if (actor === 'platform' && (to === 'draft' || to === 'suspended')) {
    assertModerationReason(to, reason);
  }

  return { from, to, by: actor, reason };
}

/** Whether a visitor can see it. One place, so no query has to remember. */
export const isListingVisible = (state: ListingState): boolean => state === 'published';
