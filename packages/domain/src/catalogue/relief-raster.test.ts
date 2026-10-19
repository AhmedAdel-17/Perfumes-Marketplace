import { describe, expect, it } from 'vitest';
import {
  boxesForGauss, centroid, distanceInside, fillHoles, gaussianBlur, largestRegion, otsu, plane,
  polygonCoverage, rotatePlanes, rotation,
} from './relief-raster';

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

describe('polygon coverage', () => {
  it('covers whole pixels inside a square and none outside', () => {
    const m = polygonCoverage(10, 10, [[2, 2], [6, 2], [6, 6], [2, 6]]);
    expect(sum(m.data)).toBeCloseTo(16, 4);
    expect(m.data[3 * 10 + 3]).toBeCloseTo(1, 5);
    expect(m.data[1 * 10 + 1]).toBe(0);
  });

  it('measures a half-covered edge as half', () => {
    const m = polygonCoverage(10, 10, [[2.5, 2], [6, 2], [6, 6], [2.5, 6]]);
    expect(m.data[3 * 10 + 2]).toBeCloseTo(0.5, 5);
    expect(sum(m.data)).toBeCloseTo(14, 4);
  });

  it('draws nothing for fewer than three points', () => {
    expect(sum(polygonCoverage(5, 5, [[0, 0], [4, 4]]).data)).toBe(0);
  });

  it('finds the area centroid, not the mean of the corners', () => {
    expect(centroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
    // Extra corners along one edge must not pull the centre toward it.
    const [x, y] = centroid([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 2], [0, 2]]);
    expect(x).toBeCloseTo(2, 6); expect(y).toBeCloseTo(1, 6);
  });
});

describe('Gaussian blur', () => {
  it('chooses odd box widths', () => {
    for (const s of [1, 2.5, 7, 28]) for (const w of boxesForGauss(s)) expect(w % 2).toBe(1);
  });

  it('keeps an impulse’s mass and spreads it', () => {
    const p = plane(61, 61);
    p.data[30 * 61 + 30] = 1;
    const b = gaussianBlur(p, 3);
    expect(sum(b.data)).toBeCloseTo(1, 4);
    expect(b.data[30 * 61 + 30]).toBeLessThan(0.05);
    expect(b.data[30 * 61 + 33]).toBeGreaterThan(0);
  });

  it('leaves a constant field constant away from its edges', () => {
    const b = gaussianBlur(plane(40, 40, 0.7), 2);
    expect(b.data[20 * 40 + 20]).toBeCloseTo(0.7, 5);
  });

  it('copies rather than blurs below a third of a pixel', () => {
    const p = plane(3, 3); p.data[4] = 1;
    const b = gaussianBlur(p, 0.1);
    expect(Array.from(b.data)).toEqual(Array.from(p.data));
    expect(b.data).not.toBe(p.data);
  });
});

describe('distance inside', () => {
  it('measures to the nearest outside pixel, the image border included', () => {
    const d = distanceInside(7, 7, () => true);
    expect(d.data[3 * 7 + 3]).toBeCloseTo(4, 6);
    expect(d.data[0]).toBeCloseTo(1, 6);
  });

  it('is zero outside and exact on a diagonal', () => {
    // Inside everywhere except (0,0): from (3,3) the nearest outside is (0,0) or the border.
    const d = distanceInside(9, 9, (i) => i !== 0);
    expect(d.data[0]).toBe(0);
    expect(d.data[1 * 9 + 1]).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('regions', () => {
  it('keeps the largest region', () => {
    const on = new Uint8Array(10 * 10);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) on[y! * 10 + x!] = 1;
    for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) on[y * 10 + x] = 1;
    const { mask, size } = largestRegion(10, 10, on);
    expect(size).toBe(9);
    expect(mask[0]).toBe(0);
    expect(mask[6 * 10 + 6]).toBe(1);
  });

  it('fills an enclosed hole and leaves the outside alone', () => {
    const on = new Uint8Array(7 * 7);
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) on[y * 7 + x] = (x === 1 || x === 5 || y === 1 || y === 5) ? 1 : 0;
    const filled = fillHoles(7, 7, on);
    expect(filled[3 * 7 + 3]).toBe(1);
    expect(filled[0]).toBe(0);
  });

  it('splits two populations between them', () => {
    const v = new Float32Array(200);
    v.fill(0.1, 0, 100); v.fill(0.8, 100);
    const t = otsu(v);
    expect(t).toBeGreaterThan(0.1);
    expect(t).toBeLessThanOrEqual(0.8);
  });
});

describe('rotation', () => {
  it('a quarter turn swaps the sides', () => {
    const r = rotation(40, 20, 90);
    expect([r.width, r.height]).toEqual([20, 40]);
  });

  it('maps the centre to the centre', () => {
    const r = rotation(40, 20, 33);
    const [x, y] = r.toSource(r.width / 2, r.height / 2);
    expect(x).toBeCloseTo(20, 6); expect(y).toBeCloseTo(10, 6);
  });

  it('turns counter-clockwise as seen: the top-right goes to the top-left', () => {
    // In the turned canvas, a point up and to the LEFT of centre came from up and to the RIGHT.
    const r = rotation(100, 100, 90);
    const [x, y] = r.toSource(r.width / 2 - 10, r.height / 2);
    expect(x).toBeCloseTo(50, 6); expect(y).toBeCloseTo(40, 6);
  });

  it('no turn reproduces the image', () => {
    const p = plane(5, 4);
    for (let i = 0; i < p.data.length; i++) p.data[i] = i / 20;
    const out = rotatePlanes([p], 0).planes[0]!;
    expect(out.width).toBe(5); expect(out.height).toBe(4);
    for (let i = 0; i < p.data.length; i++) expect(out.data[i]).toBeCloseTo(p.data[i]!, 5);
  });
});
