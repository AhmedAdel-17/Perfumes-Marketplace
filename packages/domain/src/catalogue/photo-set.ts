/**
 * A product's photographs, as a set — what a house may add, describe and remove.
 *
 * Pattern — pure policy (ENGINEERING_PRINCIPLES §4). The repository applies
 * these; it does not decide them. A rule about a live product losing its only
 * photograph that lived in a click handler would be a rule a second screen, an
 * API client or a script could walk straight past.
 */
import type { ListingState } from './listing';

/**
 * Eight, and why.
 *
 * Bottle, box, label, the atomiser, a detail of the glass, the bottle in a hand
 * for scale — six photographs tell a perfume. Eight leaves room without letting
 * a gallery become a camera roll, which on a product page stops being looked at
 * and starts being scrolled past.
 */
export const MAX_PHOTOS = 8;

/**
 * A description, not a caption.
 *
 * Read aloud by a screen reader in place of the photograph, so it should say
 * what is in the frame in one breath. The publish rule already refuses a primary
 * photograph without one; the limit keeps it a sentence rather than a listing.
 */
export const ALT_TEXT_MAX = 160;

export interface PhotoSummary {
  readonly id: string;
  readonly isPrimary: boolean;
}

/**
 * Every reason a photograph may be refused, as a list a test can enumerate.
 *
 * `primary_of_live_listing` — removing it would leave a product that is live, or
 * awaiting review, with no primary photograph.
 */
export const PHOTO_OBJECTIONS = [
  'too_many_photos',
  'alt_required',
  'alt_too_long',
  'ownership_unconfirmed',
  'primary_of_live_listing',
] as const;

export type PhotoObjection = (typeof PHOTO_OBJECTIONS)[number];

/** States in which a listing is — or is about to be — in front of customers. */
const LIVE: readonly ListingState[] = ['published', 'pending_moderation'];

export function objectionsToAddingPhoto(input: {
  readonly existing: number;
  readonly alt: string;
  readonly ownershipConfirmed: boolean;
}): PhotoObjection[] {
  const objections: PhotoObjection[] = [];
  if (input.existing >= MAX_PHOTOS) objections.push('too_many_photos');
  objections.push(...objectionsToDescribing(input));
  return objections;
}

/**
 * The details a house writes about a photograph.
 *
 * Ownership is required at the moment of adding, not later: the catalogue
 * schema treats it as a condition of the photograph existing here at all, and a
 * checkbox that can be left for later is a checkbox that is.
 */
export function objectionsToDescribing(input: {
  readonly alt: string;
  readonly ownershipConfirmed: boolean;
}): PhotoObjection[] {
  const objections: PhotoObjection[] = [];
  const alt = input.alt.trim();
  if (alt.length === 0) objections.push('alt_required');
  if (alt.length > ALT_TEXT_MAX) objections.push('alt_too_long');
  if (!input.ownershipConfirmed) objections.push('ownership_unconfirmed');
  return objections;
}

/**
 * Whether a photograph may be removed.
 *
 * The primary photograph of a live listing may not simply disappear: the
 * database refuses to PUBLISH without one, but it cannot un-publish a product
 * whose photograph is deleted afterwards, so the shopfront would show a product
 * with nothing to look at. The house makes another photograph primary first,
 * and then removes this one — which is two deliberate acts rather than one
 * accidental one.
 */
export function objectionsToRemovingPhoto(input: {
  readonly photo: PhotoSummary;
  readonly listingState: ListingState;
}): PhotoObjection[] {
  if (input.photo.isPrimary && LIVE.includes(input.listingState)) {
    return ['primary_of_live_listing'];
  }
  return [];
}

/**
 * The new order of a product's photographs, or null when the proposal is not a
 * reordering of exactly the photographs the product has.
 *
 * Refused rather than repaired: a list with a missing id means the house was
 * looking at a stale screen, and silently appending the missing photograph puts
 * it somewhere nobody chose.
 */
export function reorderedPhotos(
  current: readonly PhotoSummary[],
  proposedIds: readonly string[],
): string[] | null {
  if (proposedIds.length !== current.length) return null;
  const known = new Set(current.map((p) => p.id));
  const proposed = new Set(proposedIds);
  if (proposed.size !== proposedIds.length) return null;
  for (const id of proposedIds) if (!known.has(id)) return null;
  return [...proposedIds];
}
