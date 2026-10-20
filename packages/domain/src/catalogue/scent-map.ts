/**
 * The catalogue as a map of scent (La Carte olfactive — founder 19 Oct 2026;
 * design-reference/experiences/03-carte-olfactive.html): every perfume in its
 * family, every note in the family it belongs to by nature, and a thread from
 * each perfume to each of its notes — so a perfume's character is literally
 * its constellation, and one that reaches across the sky is a perfume of
 * contrasts.
 *
 * This is the GRAPH, not the drawing: who stands where and what joins them.
 * The storefront lays it out on a wheel. It is the catalogue's own data and
 * nothing more, which is why it leans on the controlled vocabularies (CLAUDE.md
 * §4): a perfume's family is a listing field, a note's comes from the glossary
 * (migration 0035). A note the glossary has not given a family is left off the
 * map and counted — never guessed from the perfume that carries it.
 */
import { SCENT_FAMILIES, type ScentFamily } from './vocabularies';
import { NOTE_TIERS, type NoteTier } from './note-index';

/**
 * The wheel's order, as a perfumer's wheel is drawn: each family between its
 * relatives — fresh beside floral, floral softening into musk, musk into
 * gourmand, gourmand warming into amber, amber darkening into oud, oud into
 * the woods, and the woods back round to fresh.
 */
export const SCENT_WHEEL: readonly ScentFamily[] = ['fresh', 'floral', 'musk', 'gourmand', 'amber', 'oud', 'woody'];

export interface MapPerfumeInput {
  readonly id: string;
  /** The listing's family code; a perfume without a known one cannot stand on the wheel. */
  readonly family: string | null;
  readonly notes: Readonly<Record<NoteTier, readonly string[]>>;
}

export interface MapNote {
  /** The note as houses write it — the glossary's key. */
  readonly note: string;
  readonly family: ScentFamily;
  /** Every perfume that carries it, and in which tier. */
  readonly carriedBy: ReadonlyArray<{ readonly perfumeId: string; readonly tier: NoteTier }>;
}

export interface ScentMapGraph {
  /** The families in wheel order, each with what stands in it. */
  readonly families: ReadonlyArray<{ readonly family: ScentFamily; readonly perfumes: readonly string[]; readonly notes: readonly string[] }>;
  readonly notes: readonly MapNote[];
  /** Notes the glossary has not placed yet: off the map, and the console's work list. */
  readonly unplaced: readonly string[];
  /** Perfumes with no family the wheel knows — none, for a published catalogue. */
  readonly unplacedPerfumes: readonly string[];
}

const isFamily = (value: string | null): value is ScentFamily =>
  value !== null && (SCENT_FAMILIES as readonly string[]).includes(value);

export function scentMap(
  perfumes: readonly MapPerfumeInput[],
  familyOf: (note: string) => ScentFamily | null,
): ScentMapGraph {
  const notes = new Map<string, { family: ScentFamily; carriedBy: Array<{ perfumeId: string; tier: NoteTier }> }>();
  const unplaced = new Set<string>();
  const unplacedPerfumes: string[] = [];
  const perfumesIn = new Map<ScentFamily, string[]>(SCENT_WHEEL.map((f) => [f, []]));

  for (const perfume of perfumes) {
    if (!isFamily(perfume.family)) { unplacedPerfumes.push(perfume.id); continue; }
    perfumesIn.get(perfume.family)!.push(perfume.id);
    for (const tier of NOTE_TIERS) {
      for (const raw of perfume.notes[tier]) {
        const note = raw.trim();
        if (!note) continue;
        const family = familyOf(note);
        if (!family) { unplaced.add(note); continue; }
        const entry = notes.get(note) ?? { family, carriedBy: [] };
        // A note listed twice by one perfume is one thread, at its first tier.
        if (!entry.carriedBy.some((c) => c.perfumeId === perfume.id)) entry.carriedBy.push({ perfumeId: perfume.id, tier });
        notes.set(note, entry);
      }
    }
  }

  const placed = [...notes].map(([note, entry]): MapNote => ({ note, family: entry.family, carriedBy: entry.carriedBy }));
  return {
    families: SCENT_WHEEL.map((family) => ({
      family,
      perfumes: perfumesIn.get(family)!,
      notes: placed.filter((n) => n.family === family).map((n) => n.note),
    })),
    notes: placed,
    unplaced: [...unplaced],
    unplacedPerfumes,
  };
}
