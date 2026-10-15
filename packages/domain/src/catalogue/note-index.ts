/**
 * The notes index: which notes the published catalogue carries, tier by tier,
 * and in how many perfumes.
 *
 * A pure function over rows the read model already returns, not a query of its
 * own. The count is a RULE (what counts as "a perfume with this note") and it
 * belongs where rules are tested, not in a GROUP BY over three text arrays that
 * would have to be unnested to be counted at all.
 *
 * THE RULES.
 *   - A perfume counts ONCE per note per tier. A house that wrote "عود" twice in
 *     its base did not make two perfumes.
 *   - The tiers are counted SEPARATELY. Bergamot in one perfume's top and
 *     another's heart is one perfume in each tier. That is what the index shows:
 *     where a note sits, not only whether it appears.
 *   - Whitespace around a note is not part of it. Anything else is: notes are
 *     matched exactly as the house wrote them, because folding them here would
 *     merge two notes the glossary might name differently.
 *   - Most-used first. Ties go in Arabic alphabetical order, so the index is
 *     stable between two loads of the same catalogue.
 */

export type NoteTier = 'top' | 'heart' | 'base';

export const NOTE_TIERS: readonly NoteTier[] = ['top', 'heart', 'base'];

/** The three note lists of one perfume, as the catalogue stores them. */
export interface NotedProduct {
  readonly notesTop: readonly string[];
  readonly notesHeart: readonly string[];
  readonly notesBase: readonly string[];
}

export interface NoteCount {
  readonly note: string;
  readonly count: number;
}

export type NoteIndex = Readonly<Record<NoteTier, readonly NoteCount[]>>;

const listOf = (product: NotedProduct, tier: NoteTier): readonly string[] =>
  tier === 'top' ? product.notesTop : tier === 'heart' ? product.notesHeart : product.notesBase;

/**
 * `perTier` caps each tier's list. An index of every note the catalogue has ever
 * carried is a wall of chips nobody reads; the full list is what search is for.
 */
export function noteIndex(products: readonly NotedProduct[], perTier: number): NoteIndex {
  const count = (tier: NoteTier): readonly NoteCount[] => {
    const totals = new Map<string, number>();
    for (const product of products) {
      const seen = new Set<string>();
      for (const raw of listOf(product, tier)) {
        const note = raw.trim();
        if (note === '' || seen.has(note)) continue;
        seen.add(note);
        totals.set(note, (totals.get(note) ?? 0) + 1);
      }
    }
    return [...totals]
      .map(([note, n]) => ({ note, count: n }))
      .sort((a, b) => b.count - a.count || a.note.localeCompare(b.note, 'ar'))
      .slice(0, Math.max(0, perTier));
  };

  return { top: count('top'), heart: count('heart'), base: count('base') };
}
