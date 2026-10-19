import { describe, expect, it } from 'vitest';
import { glassPalette, luminance, type ScentFamily } from './glass';
import { scentFamily } from './index';

const FAMILIES = Object.keys(scentFamily) as ScentFamily[];

describe('glass palette — the stops must actually step', () => {
  it('darkens from core to deep to edge, for every family', () => {
    // If these collapse, the bottle renders as a flat rectangle again — which
    // is the exact defect this module exists to fix, so it is asserted rather
    // than assumed.
    for (const family of FAMILIES) {
      const p = glassPalette(family);
      expect(luminance(p.edge), `${family} edge < deep`).toBeLessThan(luminance(p.deep));
      expect(luminance(p.deep), `${family} deep < core`).toBeLessThan(luminance(p.core));
    }
  });

  it('keeps the empty glass visibly SEPARATE from the liquid', () => {
    // This assertion originally read `air > deep` — empty glass must be lighter
    // than liquid, which is what intuition says and what a physics textbook
    // says about a clear bottle on a white sweep. On a DARK set it is wrong,
    // and it was wrong in a way that shipped: a pale upper body against a dark
    // ground erased the silhouette and the whole flacon rendered as a milky
    // ghost. The invariant that actually matters is SEPARATION — the eye must
    // be able to find the liquid line — not which side is brighter.
    for (const family of FAMILIES) {
      const p = glassPalette(family);
      const gap = Math.abs(luminance(p.air) - luminance(p.deep));
      expect(gap, `${family}: air and deep are indistinguishable`).toBeGreaterThan(0.004);
      expect(luminance(p.air), family).toBeLessThan(luminance(p.core));
    }
  });

  it('makes the mist the lightest stop — light, never shadow — and keeps families apart', () => {
    for (const family of FAMILIES) {
      const p = glassPalette(family);
      expect(luminance(p.mist), family).toBeGreaterThan(luminance(p.caustic));
    }
    expect(new Set(FAMILIES.map((f) => glassPalette(f).mist)).size).toBe(FAMILIES.length);
  });

  it('gives every family a visibly distinct core', () => {
    const cores = FAMILIES.map((f) => glassPalette(f).core);
    expect(new Set(cores).size).toBe(FAMILIES.length);
  });

  it('emits well-formed hex for every stop', () => {
    for (const family of FAMILIES) {
      for (const [stop, value] of Object.entries(glassPalette(family))) {
        expect(value, `${family}.${stop}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('falls back to amber rather than throwing on an unknown family', () => {
    // scent_family is nullable in the schema; a product with no family must
    // still render a bottle, not a blank.
    expect(glassPalette('not-a-family')).toEqual(glassPalette('amber'));
  });

  it('is pure — the same family always yields the same palette', () => {
    expect(glassPalette('oud')).toEqual(glassPalette('oud'));
  });
});
