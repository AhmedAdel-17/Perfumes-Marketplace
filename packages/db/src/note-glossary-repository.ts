import { eq } from 'drizzle-orm';
import type { NoteGlossaryEntry, NoteGlossaryRepository } from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

/**
 * The notes glossary, for the console (migration 0030).
 *
 * Counted in TypeScript from two plain reads rather than one `unnest` query:
 * the result shape of a raw query differs between the drivers this package
 * runs on, and at catalogue scale — hundreds of listings, a few notes each —
 * the count costs nothing. Revisit if the catalogue reaches the tens of
 * thousands.
 */
export const noteGlossaryRepository = (db: DiyarDatabase): NoteGlossaryRepository => ({
  async entries() {
    const listings = await db.select({
      top: schema.products.notesTop,
      heart: schema.products.notesHeart,
      base: schema.products.notesBase,
    }).from(schema.products);

    const uses = new Map<string, number>();
    for (const listing of listings) {
      for (const note of [...(listing.top ?? []), ...(listing.heart ?? []), ...(listing.base ?? [])]) {
        const key = note.trim();
        if (key) uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }

    const glossary = await db.select({ ar: schema.noteGlossary.ar, en: schema.noteGlossary.en })
      .from(schema.noteGlossary);
    const english = new Map(glossary.map((row) => [row.ar, row.en]));

    const notes = new Set([...uses.keys(), ...english.keys()]);
    return [...notes]
      .map((ar): NoteGlossaryEntry => ({ ar, en: english.get(ar) ?? null, uses: uses.get(ar) ?? 0 }))
      .sort((a, b) =>
        Number(a.en !== null) - Number(b.en !== null)
        || b.uses - a.uses
        || a.ar.localeCompare(b.ar, 'ar'));
  },

  async set(ar, en, updatedBy) {
    const [previous] = await db.select({ en: schema.noteGlossary.en })
      .from(schema.noteGlossary)
      .where(eq(schema.noteGlossary.ar, ar))
      .limit(1);

    await db.insert(schema.noteGlossary)
      .values({ ar, en, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.noteGlossary.ar,
        set: { en, updatedBy, updatedAt: new Date() },
      });

    return { before: previous?.en ?? null };
  },

  async remove(ar) {
    const removed = await db.delete(schema.noteGlossary)
      .where(eq(schema.noteGlossary.ar, ar))
      .returning({ ar: schema.noteGlossary.ar });
    return removed.length > 0;
  },
});
