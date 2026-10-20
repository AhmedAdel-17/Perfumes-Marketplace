/**
 * The platform's glossary of scent notes: Arabic as houses write it, English as
 * the English storefront prints it (D-3; migration 0030).
 *
 * A REPOSITORY for the console's side — the entries, how often each note is
 * used, and editing them. The storefront's side is a single lookup on the
 * catalogue read model (`noteGlossary`), because the shopfront only ever reads.
 */
import type { NoteIcon, ScentFamily } from '../catalogue/vocabularies';

export interface NoteGlossaryEntry {
  /** The note exactly as houses write it. */
  readonly ar: string;
  /** Its English name, or null when nobody has written one yet. */
  readonly en: string | null;
  /** The drawing printed beside it, or null when none has been chosen. */
  readonly icon: NoteIcon | null;
  /** The family it belongs to by nature, for the scent map (0035); null until chosen. */
  readonly family: ScentFamily | null;
  /** How many listings use it, published or not. Zero for an entry no listing uses any more. */
  readonly uses: number;
}

export interface NoteGlossaryRepository {
  /**
   * Every note any listing uses, joined to its English, plus glossary entries
   * no listing uses any more. Untranslated first, then most used: the order in
   * which translating them helps the most visitors.
   */
  entries(): Promise<NoteGlossaryEntry[]>;

  /**
   * Writes one entry. Returns what it replaced, for the audit trail. `icon`
   * or `family` left out keeps what the entry has; `null` clears it.
   */
  set(ar: string, en: string, updatedBy: string, icon?: NoteIcon | null, family?: ScentFamily | null): Promise<{
    before: string | null;
    beforeIcon: NoteIcon | null;
    beforeFamily: ScentFamily | null;
  }>;

  /** Removes one entry. False when there was none. */
  remove(ar: string): Promise<boolean>;
}
