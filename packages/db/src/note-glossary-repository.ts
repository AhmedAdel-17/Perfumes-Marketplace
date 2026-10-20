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

    const glossary = await db.select({
      ar: schema.noteGlossary.ar,
      en: schema.noteGlossary.en,
      icon: schema.noteGlossary.icon,
      family: schema.noteGlossary.family,
    }).from(schema.noteGlossary);
    const english = new Map(glossary.map((row) => [row.ar, row]));

    const notes = new Set([...uses.keys(), ...english.keys()]);
    return [...notes]
      .map((ar): NoteGlossaryEntry => ({
        ar,
        en: english.get(ar)?.en ?? null,
        icon: english.get(ar)?.icon ?? null,
        family: english.get(ar)?.family ?? null,
        uses: uses.get(ar) ?? 0,
      }))
      .sort((a, b) =>
        Number(a.en !== null) - Number(b.en !== null)
        || b.uses - a.uses
        || a.ar.localeCompare(b.ar, 'ar'));
  },

  async set(ar, en, updatedBy, icon, family) {
    const [previous] = await db.select({ en: schema.noteGlossary.en, icon: schema.noteGlossary.icon, family: schema.noteGlossary.family })
      .from(schema.noteGlossary)
      .where(eq(schema.noteGlossary.ar, ar))
      .limit(1);

    // `undefined` keeps the drawing (or the family) an entry already has; only
    // an explicit value or null changes it.
    const drawing = icon === undefined ? {} : { icon };
    const kin = family === undefined ? {} : { family };
    await db.insert(schema.noteGlossary)
      .values({ ar, en, icon: icon ?? null, family: family ?? null, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.noteGlossary.ar,
        set: { en, ...drawing, ...kin, updatedBy, updatedAt: new Date() },
      });

    return { before: previous?.en ?? null, beforeIcon: previous?.icon ?? null, beforeFamily: previous?.family ?? null };
  },

  async remove(ar) {
    const removed = await db.delete(schema.noteGlossary)
      .where(eq(schema.noteGlossary.ar, ar))
      .returning({ ar: schema.noteGlossary.ar });
    return removed.length > 0;
  },
});
