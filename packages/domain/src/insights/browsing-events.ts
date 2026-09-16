/**
 * What the shop records about browsing — WORK_PLAN 9.5, founder decision A-1.
 *
 * The post-order funnel has always been measurable: it is made of sub-orders and
 * their transitions. The half BEFORE the order was not recorded at all, so
 * "visitors who saw a perfume" and "perfumes that were never viewed" had no
 * answer, and `docs/ANALYTICS_DEFINITIONS.md` §2b showed that half as *not yet
 * recorded* rather than inventing it.
 *
 * A-1 decided to record it, first-party, under an anonymous id, with no personal
 * data. This module is where "no personal data" is a TYPE rather than a promise.
 *
 * WHAT AN EVENT MAY CARRY, and what it may not:
 *
 *  - the event NAME, from the fixed vocabulary below (doc 04 §6);
 *  - an ANONYMOUS ID — 24 random hex characters, issued by this site, meaningless
 *    anywhere else, and tied to no account;
 *  - the PRODUCT and the HOUSE it is about, when the event is about one.
 *
 * That is all. In particular:
 *
 *  - **no payload, ever.** The `analytics_events` table has a free-text `payload`
 *    column and this never fills it. The first thing anybody would put there is
 *    the search query — which is typed by a person and can contain a name, a
 *    phone number or an address, in a table nobody thinks of as personal data.
 *    A `search` event counts as a search; what was searched for is not recorded.
 *  - **no customer id.** Not even for a signed-in customer: joining a browsing
 *    trail to an identity is the thing A-1's "no personal data" rules out, and
 *    a column that is usually null is a column that will one day not be.
 *  - **no source or campaign.** Attribution is already recorded at ORDER time, per
 *    sub-order, by `attribution_touches` — the record that decides commission. A
 *    second, weaker copy here would be a number that disagrees with the money.
 *
 * Migration 0023 enforces the same three refusals in the database's own policy,
 * so a future caller cannot quietly widen what is stored.
 */

/**
 * The pre-order half of doc 04 §6's taxonomy, and only what the site can
 * honestly fire today.
 *
 * `payment_select` is deliberately absent: there is one payment method (cash on
 * delivery), so the event would record a choice nobody makes. `comparison_view`
 * and `wishlist_add` are absent because neither feature exists. An event that is
 * always the same value teaches nothing and still costs a row per visitor.
 */
export const BROWSING_EVENTS = [
  'landing_view',
  'storefront_view',
  'search',
  'filter_apply',
  'product_view',
  'cart_add',
  'checkout_start',
] as const;

export type BrowsingEvent = (typeof BROWSING_EVENTS)[number];

export const isBrowsingEvent = (value: string): value is BrowsingEvent =>
  (BROWSING_EVENTS as readonly string[]).includes(value);

/**
 * 24 hex characters: 12 random bytes.
 *
 * Long enough that ids do not collide across a marketplace's traffic, short
 * enough to sit in a cookie without comment. The pattern is also a CHECK in
 * 0023, so a row can never hold something longer that somebody decided to
 * "reuse" as an identifier.
 */
export const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{24}$/;

/**
 * Randomness is INJECTED, as it is for order references and media keys, so the
 * domain imports no `crypto` and the tests are deterministic.
 */
export function newAnonymousId(randomBytes: (count: number) => Uint8Array): string {
  return [...randomBytes(12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * An event as a caller offers it. There is no field here for a person, and that
 * is the point — the shape refuses before any rule runs.
 */
export interface BrowsingEventDraft {
  readonly name: string;
  readonly anonymousId: string;
  /** The perfume this is about, for `product_view` and `cart_add`. */
  readonly productId?: string | null | undefined;
  /** The house this is about, for `storefront_view`. */
  readonly sellerId?: string | null | undefined;
}

export const BROWSING_OBJECTIONS = [
  'unknown_event',
  'bad_anonymous_id',
] as const;

export type BrowsingObjection = (typeof BROWSING_OBJECTIONS)[number];

/**
 * Why an event may not be recorded. Empty when it may.
 *
 * Unknown names are refused rather than stored, because a table that accepts any
 * name is a table where a typo becomes a silent gap in a funnel — the count is
 * simply low, and nothing says why.
 */
export function objectionsToRecording(draft: BrowsingEventDraft): BrowsingObjection[] {
  const objections: BrowsingObjection[] = [];
  if (!isBrowsingEvent(draft.name)) objections.push('unknown_event');
  if (!ANONYMOUS_ID_PATTERN.test(draft.anonymousId)) objections.push('bad_anonymous_id');
  return objections;
}
