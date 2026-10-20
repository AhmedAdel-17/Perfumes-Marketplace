import { SCENT_WHEEL, type ScentFamily, type ScentMapGraph } from '@diyar/domain';

/**
 * Where everything stands on the scent map's wheel (La Carte olfactive —
 * design-reference/experiences/03-carte-olfactive.html): the families as the
 * seven sectors of an astrolabe, each perfume on the inner orbit of its own
 * sector, each note a star on the outer orbits of the family it belongs to.
 *
 * Pure and deterministic — the same catalogue always draws the same sky — so
 * the server and the visitor's browser agree, and the tests can hold it to its
 * one geometric promise: nothing ever stands outside its family's sector.
 *
 * Units are the drawing's: a square of 880 around the centre.
 */
export const TAU = Math.PI * 2;
export const SECTOR = TAU / SCENT_WHEEL.length;
export const RADII = { hub: 112, planets: 178, stars: 286, starsOuter: 328, rim: 362, limb: 378, labels: 404 } as const;

/** A sector starts at the top and runs clockwise, in wheel order. */
export const sectorStart = (i: number): number => -Math.PI / 2 + i * SECTOR;

/** A small, stable hash of a word into [0, 1): the same note always sits the same way. */
export function hash(word: string): number {
  let h = 2166136261;
  for (const ch of word) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export interface Placed { readonly a: number; readonly r: number; readonly x: number; readonly y: number }
export interface PlacedStar extends Placed { readonly note: string; readonly family: ScentFamily }
export interface PlacedPlanet extends Placed { readonly id: string; readonly family: ScentFamily; readonly scale: number }
export interface Sector { readonly family: ScentFamily; readonly a0: number; readonly a1: number; readonly mid: number }

/** Rounded to the hundredth: the server and the browser disagree in the last digits of a cosine. */
const at = (a: number, r: number): Placed => ({ a, r, x: Math.round(Math.cos(a) * r * 100) / 100, y: Math.round(Math.sin(a) * r * 100) / 100 });

/** Spread `n` things across a share of a sector: centred alone, evenly between `from` and `to` otherwise. */
const spread = (j: number, n: number, from: number, to: number) => (n === 1 ? 0.5 : from + (to - from) * (j / (n - 1)));

export function layoutMap(graph: ScentMapGraph): { sectors: Sector[]; stars: PlacedStar[]; planets: PlacedPlanet[] } {
  const sectors: Sector[] = [];
  const stars: PlacedStar[] = [];
  const planets: PlacedPlanet[] = [];
  graph.families.forEach(({ family, perfumes, notes }, i) => {
    const a0 = sectorStart(i);
    sectors.push({ family, a0, a1: a0 + SECTOR, mid: a0 + SECTOR / 2 });
    // Stars on two orbits, staggered, never in a ruled line.
    notes.forEach((note, j) => {
      const a = a0 + SECTOR * spread(j, notes.length, 0.14, 0.86);
      const r = (j % 2 ? RADII.starsOuter : RADII.stars) + (hash(note) - 0.5) * 18;
      stars.push({ ...at(a, r), note, family });
    });
    // A full sector shares its orbit: two rings, and smaller bodies.
    const crowded = perfumes.length > 3;
    const scale = crowded ? Math.max(0.55, Math.sqrt(3 / perfumes.length)) : 1;
    perfumes.forEach((id, j) => {
      const a = a0 + SECTOR * spread(j, perfumes.length, 0.28, 0.72);
      const r = crowded ? RADII.planets + (j % 2 ? 22 : -22) : RADII.planets;
      planets.push({ ...at(a, r), id, family, scale });
    });
  });
  return { sectors, stars, planets };
}

/** A thread from a perfume to one of its notes: a gentle curve drawn in toward the centre. */
export function thread(from: Placed, to: Placed): string {
  const mx = ((from.x + to.x) / 2) * 0.7, my = ((from.y + to.y) / 2) * 0.7;
  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/** The angle that brings a family's sector round to the top of the sky. */
export const facing = (family: ScentFamily): number => -(sectorStart(SCENT_WHEEL.indexOf(family)) + SECTOR / 2) - Math.PI / 2;
