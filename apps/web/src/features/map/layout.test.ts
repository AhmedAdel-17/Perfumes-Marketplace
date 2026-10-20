import { describe, expect, it } from 'vitest';
import { scentMap, type MapPerfumeInput, type ScentFamily } from '@diyar/domain';
import { RADII, SECTOR, facing, hash, layoutMap, sectorStart } from './layout';

/**
 * The map's one geometric promise: everything stands inside its family's
 * sector, at the radius its kind is drawn at, and the same catalogue always
 * draws the same sky.
 */
const families: Record<string, ScentFamily> = { 'برغموت': 'fresh', 'ليمون': 'fresh', 'نعناع': 'fresh', 'ورد': 'floral', 'عود': 'oud', 'عنبر': 'amber', 'مسك': 'musk' };
const perfume = (id: string, family: ScentFamily, notes: string[]): MapPerfumeInput => ({ id, family, notes: { top: notes, heart: [], base: [] } });
const graph = scentMap([
  perfume('a', 'amber', ['برغموت', 'عنبر', 'عود']),
  perfume('b', 'floral', ['ورد', 'مسك', 'ليمون']),
  perfume('c', 'fresh', ['نعناع', 'برغموت']),
  ...['d', 'e', 'f', 'g', 'h'].map((id) => perfume(id, 'oud', ['عود'])),
], (note) => families[note] ?? null);

const within = (a: number, a0: number) => {
  const k = (((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return k > 0 && k < SECTOR;
};

describe('the scent map’s wheel', () => {
  const { sectors, stars, planets } = layoutMap(graph);

  it('cuts seven sectors that close the circle', () => {
    expect(sectors).toHaveLength(7);
    expect(sectors[0]!.a0).toBeCloseTo(-Math.PI / 2, 10);
    expect(sectors[6]!.a1).toBeCloseTo(sectorStart(7), 10);
  });

  it('stands every star inside its family’s sector, on the outer orbits', () => {
    for (const star of stars) {
      const sector = sectors.find((s) => s.family === star.family)!;
      expect(within(star.a, sector.a0)).toBe(true);
      expect(star.r).toBeGreaterThan(RADII.planets);
      expect(star.r).toBeLessThan(RADII.rim);
    }
    expect(stars.find((s) => s.note === 'برغموت')?.family).toBe('fresh');
  });

  it('stands every perfume inside its own sector, and shares a crowded one', () => {
    for (const p of planets) {
      const sector = sectors.find((s) => s.family === p.family)!;
      expect(within(p.a, sector.a0)).toBe(true);
      expect(p.r).toBeGreaterThan(RADII.hub);
      expect(p.r).toBeLessThan(RADII.stars - 40);
    }
    const ouds = planets.filter((p) => p.family === 'oud');
    expect(ouds).toHaveLength(5);
    expect(new Set(ouds.map((p) => p.r)).size).toBe(2);
    expect(ouds.every((p) => p.scale < 1)).toBe(true);
    expect(planets.find((p) => p.id === 'a')?.scale).toBe(1);
  });

  it('draws the same sky for the same catalogue', () => {
    expect(layoutMap(graph)).toEqual(layoutMap(graph));
    expect(hash('عود')).toBe(hash('عود'));
  });

  it('brings a chosen family round to the top', () => {
    const turn = facing('oud');
    const sector = sectors.find((s) => s.family === 'oud')!;
    const top = sector.mid + turn;
    expect(Math.cos(top)).toBeCloseTo(0, 10);
    expect(Math.sin(top)).toBeCloseTo(-1, 10);
  });
});
