import { describe, expect, it } from 'vitest';
import { SCENT_FAMILIES, type ScentFamily } from './vocabularies';
import { SCENT_WHEEL, scentMap, type MapPerfumeInput } from './scent-map';

/**
 * The map is the catalogue's own data drawn, so it must hold exactly what the
 * catalogue says: each perfume in its family, each note in the family the
 * glossary gave it, a thread for every perfume–note pair, and nothing guessed.
 */
const GLOSSARY: Record<string, ScentFamily> = {
  'برغموت': 'fresh', 'زعفران': 'amber', 'ورد': 'floral', 'عود': 'oud', 'مسك': 'musk',
};
const familyOf = (note: string) => GLOSSARY[note] ?? null;

const layl: MapPerfumeInput = { id: 'layl', family: 'amber', notes: { top: ['برغموت', 'زعفران'], heart: ['ورد'], base: ['عود', 'مسك'] } };
const ward: MapPerfumeInput = { id: 'ward', family: 'floral', notes: { top: ['برغموت'], heart: ['ورد', 'ياسمين'], base: ['مسك'] } };

describe('the scent map is the catalogue, drawn', () => {
  it('walks the wheel in a perfumer’s order, every family once', () => {
    expect([...SCENT_WHEEL].sort()).toEqual([...SCENT_FAMILIES].sort());
    const map = scentMap([layl, ward], familyOf);
    expect(map.families.map((f) => f.family)).toEqual([...SCENT_WHEEL]);
  });

  it('stands each perfume in its own family, and an empty family stays on the wheel', () => {
    const map = scentMap([layl, ward], familyOf);
    expect(map.families.find((f) => f.family === 'amber')?.perfumes).toEqual(['layl']);
    expect(map.families.find((f) => f.family === 'floral')?.perfumes).toEqual(['ward']);
    expect(map.families.find((f) => f.family === 'gourmand')).toEqual({ family: 'gourmand', perfumes: [], notes: [] });
  });

  it('puts a note in the family the glossary gave it, not its perfume’s', () => {
    const map = scentMap([layl], familyOf);
    // Bergamot is carried by an amber perfume and is still a fresh note.
    expect(map.notes.find((n) => n.note === 'برغموت')?.family).toBe('fresh');
    expect(map.families.find((f) => f.family === 'fresh')?.notes).toEqual(['برغموت']);
  });

  it('threads a shared note to every perfume that carries it, with the tier it is in', () => {
    const map = scentMap([layl, ward], familyOf);
    expect(map.notes.find((n) => n.note === 'ورد')?.carriedBy).toEqual([
      { perfumeId: 'layl', tier: 'heart' },
      { perfumeId: 'ward', tier: 'heart' },
    ]);
    expect(map.notes.find((n) => n.note === 'مسك')?.carriedBy.map((c) => c.perfumeId)).toEqual(['layl', 'ward']);
  });

  it('leaves a note with no family off the map and says so, rather than guessing', () => {
    const map = scentMap([layl, ward], familyOf);
    expect(map.notes.some((n) => n.note === 'ياسمين')).toBe(false);
    expect(map.unplaced).toEqual(['ياسمين']);
  });

  it('draws one thread for a note a perfume lists twice', () => {
    const twice: MapPerfumeInput = { id: 'twice', family: 'oud', notes: { top: ['عود'], heart: [], base: ['عود'] } };
    expect(scentMap([twice], familyOf).notes[0]?.carriedBy).toEqual([{ perfumeId: 'twice', tier: 'top' }]);
  });

  it('keeps a perfume without a known family off the wheel, and counts it', () => {
    const lost: MapPerfumeInput = { id: 'lost', family: null, notes: { top: ['برغموت'], heart: [], base: [] } };
    const map = scentMap([lost], familyOf);
    expect(map.unplacedPerfumes).toEqual(['lost']);
    expect(map.notes).toEqual([]);
  });
});
