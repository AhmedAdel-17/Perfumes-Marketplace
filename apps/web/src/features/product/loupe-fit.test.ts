import { describe, expect, it } from 'vitest';
import { FLOOR, POWER, lensFit, lensOffset } from './loupe-fit';

/**
 * The loupe's promise: it shows the house's photograph larger, never more
 * finely than the photograph was taken.
 */
describe('the loupe never magnifies past the photograph', () => {
  const photo = { w: 1000, h: 1250 };

  it('reaches its full power where the photograph has the pixels for it', () => {
    // A phone's frame, about a third of the photograph's own size.
    const fit = lensFit({ w: 335, h: 419 }, photo, 1000);
    expect(fit.zoom).toBe(POWER);
    expect(fit.usable).toBe(true);
  });

  it('stops at the photograph’s own detail on a large frame, and says so', () => {
    // A desktop frame shows the 1000px photograph at 0.7: the glass can only
    // bring it back to its own pixels — about ×1.43 — never to ×2.4.
    const fit = lensFit({ w: 700, h: 620 }, photo, 1000);
    expect(fit.scale).toBeCloseTo(0.7, 5);
    expect(fit.zoom).toBeCloseTo(1 / 0.7, 5);
    expect(fit.zoom * fit.scale).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('offers no glass at all where there is too little to show', () => {
    const fit = lensFit({ w: 900, h: 900 }, photo, 1000);
    expect(fit.zoom).toBeLessThan(FLOOR);
    expect(fit.usable).toBe(false);
  });

  it('counts only the pixels of the copy it loads, not the original’s', () => {
    // A 4000px original served as a 2048px copy has 2048px of detail to give.
    const big = { w: 4000, h: 5000 };
    const wide = lensFit({ w: 1400, h: 1240 }, big, 2048);
    expect(wide.zoom).toBeLessThan(POWER);
    expect(wide.zoom * wide.scale).toBeCloseTo(2048 / 4000, 5);
    // On a smaller frame the same copy has room to spare, and the glass stops at its power.
    const small = lensFit({ w: 700, h: 620 }, big, 2048);
    expect(small.zoom).toBe(POWER);
    expect(small.zoom * small.scale).toBeLessThan(2048 / 4000);
  });

  it('puts the point under the hand at the centre of the glass, through the crop', () => {
    const fit = lensFit({ w: 700, h: 620 }, photo, 1000);
    // object-cover crops the photograph top and bottom here.
    expect(fit.ox).toBeCloseTo(0, 5);
    expect(fit.oy).toBeLessThan(0);
    const at = { x: 350, y: 310 };
    const behind = lensOffset(fit, at, 156);
    // The photograph point under the hand, magnified, lands at 78px — the middle.
    expect((at.x - fit.ox) * fit.zoom + behind.x).toBeCloseTo(78, 5);
    expect((at.y - fit.oy) * fit.zoom + behind.y).toBeCloseTo(78, 5);
  });
});
