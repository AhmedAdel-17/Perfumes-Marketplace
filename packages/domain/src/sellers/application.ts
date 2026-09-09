/**
 * A house applying to join.
 *
 * `sellers.status` has had `'applied'` in its enum since the first migration,
 * the verification checklist has been seeded by a trigger since the second, and
 * the go-live gate has refused unverified houses since then too. All of that
 * existed and there was no way to become an applicant: a house joined this
 * marketplace by somebody typing SQL.
 *
 * WHAT AN APPLICATION ASKS FOR IS A PRODUCT DECISION, and the decision here is
 * to ask for almost nothing. The eight verification controls are the real
 * gate — identity, payout ownership, product responsibility, labels, claims,
 * return route, capacity, privacy contact — and they are worked through with a
 * person afterwards. A form that tried to collect all eight up front would be a
 * form nobody finishes, and the people it filters out are exactly the small
 * makers this marketplace exists for.
 *
 * So it asks who you are, what you make, and how to reach you. Everything else
 * is a conversation.
 */

/** Longer than this is a pitch deck; the operator needs a paragraph. */
export const APPLICATION_NOTE_MAX = 1_500;
export const APPLICATION_NOTE_MIN = 40;

export type ApplicationObjection =
  | 'trading_name_required'
  | 'latin_name_required'
  | 'latin_name_not_latin'
  | 'owner_name_required'
  | 'city_required'
  | 'note_too_short'
  | 'note_too_long'
  | 'unusable_slug';

/**
 * The storefront address, from the house's Latin wordmark.
 *
 * A LATIN NAME IS ASKED FOR SEPARATELY rather than transliterated from the
 * Arabic one. Transliteration is a guess — ميزون نور could be `maison-nour`,
 * `mayzon-nour` or `mezon-noor` — and the guess becomes a permanent URL the
 * house prints on its packaging. The wordmark on the bottle is the house's own
 * decision and they already know what it is.
 */
export function houseSlug(latinName: string): string {
  return latinName
    .normalize('NFKD')
    // Strip combining marks, so "Café" becomes "cafe" rather than "caf".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, '');
}

/**
 * Slugs a house may not take.
 *
 * The storefronts live at `/house/<slug>`, so these cannot collide with a route
 * — but they can collide with each other and with words that would read as an
 * endorsement by the marketplace.
 */
const FORBIDDEN_SLUGS = new Set(['diyar', 'admin', 'ops', 'api', 'support', 'new', 'all']);

export function objectionsToApplying(input: {
  readonly tradingName: string;
  readonly latinName: string;
  readonly ownerName: string;
  readonly city: string;
  readonly note: string;
}): ApplicationObjection[] {
  const objections: ApplicationObjection[] = [];

  if (input.tradingName.trim().length === 0) objections.push('trading_name_required');
  if (input.ownerName.trim().length === 0) objections.push('owner_name_required');
  if (input.city.trim().length === 0) objections.push('city_required');

  const latin = input.latinName.trim();
  if (latin.length === 0) {
    objections.push('latin_name_required');
  } else if (!/[a-zA-Z]/.test(latin)) {
    /*
     * Someone typing the Arabic name into the Latin box.
     *
     * It is the commonest way this form goes wrong, and the consequence is
     * silent: `houseSlug` strips every non-Latin character, so the result is an
     * empty slug and the house ends up at `/house/`. Caught here, where it can
     * be explained, rather than in a unique-index violation.
     */
    objections.push('latin_name_not_latin');
  } else {
    const slug = houseSlug(latin);
    if (slug.length < 2 || FORBIDDEN_SLUGS.has(slug)) objections.push('unusable_slug');
  }

  const note = input.note.trim();
  if (note.length < APPLICATION_NOTE_MIN) objections.push('note_too_short');
  if (note.length > APPLICATION_NOTE_MAX) objections.push('note_too_long');

  return objections;
}
