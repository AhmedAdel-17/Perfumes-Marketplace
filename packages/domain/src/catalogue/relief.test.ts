import { describe, expect, it } from 'vitest';
import { makeRelief, objectionsToReliefPlacement, RELIEF_LIMITS, workingSize, type Point, type Rgba } from './relief';
import { polygonCoverage } from './relief-raster';

/** A small deterministic generator, so a noisy photograph is the same every run. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Paint = readonly [number, number, number];

/**
 * A photograph built from numbers: a backdrop (a soft vertical gradient with a
 * little sensor noise, as a real one has) and shapes painted over it with
 * anti-aliased edges.
 */
function photograph(width: number, height: number, shapes: Array<{ points: readonly Point[]; paint: Paint }>, opts: { busy?: boolean } = {}): Rgba {
  const rnd = random(7);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const base = 222 - (y / height) * 14;
      const noise = opts.busy ? (rnd() - 0.5) * 220 : (rnd() - 0.5) * 6;
      data[i] = base + noise; data[i + 1] = base - 4 + (opts.busy ? (rnd() - 0.5) * 220 : noise); data[i + 2] = base - 10 + noise; data[i + 3] = 255;
    }
  }
  for (const { points, paint } of shapes) {
    const cover = polygonCoverage(width, height, points);
    for (let p = 0; p < width * height; p++) {
      const a = cover.data[p]!;
      if (a <= 0) continue;
      const i = p * 4;
      data[i] = data[i]! * (1 - a) + paint[0] * a;
      data[i + 1] = data[i + 1]! * (1 - a) + paint[1] * a;
      data[i + 2] = data[i + 2]! * (1 - a) + paint[2] * a;
    }
  }
  return { width, height, data };
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const AMBER: Paint = [196, 120, 30];
const SILVER: Paint = [150, 152, 158];

/** Points turned counter-clockwise (as seen on screen) by `deg` about (cx, cy). */
const turn = (points: readonly Point[], deg: number, cx: number, cy: number): Point[] => {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return points.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos + dy * sin, cy - dx * sin + dy * cos];
  });
};

describe('makeRelief — automatic, on a plain backdrop', () => {
  const body = rect(150, 200, 250, 420), cap = rect(180, 150, 220, 200);
  const photo = photograph(400, 500, [{ points: body, paint: AMBER }, { points: cap, paint: SILVER }]);
  const result = makeRelief(photo, { outline: { method: 'automatic' } });

  it('finds the bottle', () => {
    expect(result.ok).toBe(true);
  });

  it('records where it sat: centred on it, upright, as tall as it plus the margin', () => {
    if (!result.ok) throw new Error('no relief');
    const p = result.placement;
    expect(p.centreX).toBeCloseTo(200 / 400, 1);
    expect(p.centreY).toBeCloseTo(285 / 500, 1);
    expect(p.angle).toBe(0);
    const pad = Math.round(24 * (500 / 1250));
    expect(p.height * 500).toBeGreaterThan(270);
    expect(p.height * 500).toBeLessThan(270 + 2 * pad + 6);
  });

  it('makes the coloured glass solid and the backdrop gone', () => {
    if (!result.ok) throw new Error('no relief');
    const { cutout } = result;
    const at = (x: number, y: number) => cutout.data[(y * cutout.width + x) * 4 + 3]!;
    expect(at(cutout.width >> 1, Math.round(cutout.height * 0.7))).toBeGreaterThan(240);
    expect(at(1, 1)).toBeLessThan(10);
  });

  it('stands the faces out and leaves the edges low', () => {
    if (!result.ok) throw new Error('no relief');
    const { relief } = result;
    const h = (x: number, y: number) => relief.data[(y * relief.width + x) * 4]!;
    const mid = h(relief.width >> 1, Math.round(relief.height * 0.7));
    expect(mid).toBeGreaterThan(200);
    expect(h(1, 1)).toBe(0);
  });

  it('refuses a busy backdrop instead of guessing at it', () => {
    const busy = photograph(300, 360, [{ points: rect(110, 120, 190, 300), paint: AMBER }], { busy: true });
    const r = makeRelief(busy, { outline: { method: 'automatic' } });
    expect(r).toEqual({ ok: false, objections: ['busy_background'] });
  });

  it('refuses a picture with no bottle in it', () => {
    const empty = photograph(300, 360, []);
    expect(makeRelief(empty, { outline: { method: 'automatic' } })).toEqual({ ok: false, objections: ['no_bottle_found'] });
  });

  it('refuses a bottle the frame cuts off', () => {
    const cropped = photograph(300, 360, [{ points: rect(100, 0, 200, 300), paint: AMBER }]);
    expect(makeRelief(cropped, { outline: { method: 'automatic' } })).toEqual({ ok: false, objections: ['bottle_cropped'] });
  });
});

describe('makeRelief — traced, a bottle lying at an angle', () => {
  const cx = 200, cy = 260;
  const uprightBody = rect(150, 200, 250, 380), uprightCap = rect(180, 150, 220, 200);
  // The bottle as photographed: turned 30° counter-clockwise, its cap leaning left.
  const body = turn(uprightBody, 30, cx, cy), cap = turn(uprightCap, 30, cx, cy);
  const photo = photograph(420, 480, [{ points: body, paint: AMBER }, { points: cap, paint: SILVER }]);
  const result = makeRelief(photo, { outline: { method: 'traced', body, cap } });

  it('stands it up and records the turn that lays it back down', () => {
    if (!result.ok) throw new Error('no relief');
    expect(result.placement.angle).toBeCloseTo(30, 0);
  });

  it('crops to the upright bottle: taller than wide', () => {
    if (!result.ok) throw new Error('no relief');
    expect(result.cutout.height).toBeGreaterThan(result.cutout.width * 1.4);
  });

  it('places its centre where the bottle was', () => {
    if (!result.ok) throw new Error('no relief');
    // The upright bottle spans y 150–380 about its own middle, 265; turned about (200, 260).
    const [ex, ey] = turn([[200, 265]], 30, cx, cy)[0]!;
    expect(result.placement.centreX * 420).toBeCloseTo(ex, -1);
    expect(result.placement.centreY * 480).toBeCloseTo(ey, -1);
  });

  it('rounds the cap across its axis: high in the middle, low at its sides', () => {
    if (!result.ok) throw new Error('no relief');
    const { relief } = result;
    // Find the cap's row: the top quarter of the cut-out, through its middle.
    const y = Math.round(relief.height * 0.16);
    const row = Array.from({ length: relief.width }, (_, x) => relief.data[(y * relief.width + x) * 4]!);
    const lit = row.map((v, x) => [v, x] as const).filter(([v]) => v > 0);
    expect(lit.length).toBeGreaterThan(4);
    const middle = lit[lit.length >> 1]![0], side = lit[0]![0];
    expect(middle).toBeGreaterThan(side);
  });

  it('refuses an outline of fewer than three points', () => {
    expect(makeRelief(photo, { outline: { method: 'traced', body: [[1, 1], [5, 5]] } }))
      .toEqual({ ok: false, objections: ['outline_invalid'] });
  });

  it('refuses an outline too small to be a bottle', () => {
    expect(makeRelief(photo, { outline: { method: 'traced', body: rect(10, 10, 14, 14) } }))
      .toEqual({ ok: false, objections: ['outline_too_small'] });
  });
});

describe('makeRelief — glass', () => {
  // Clear glass shows the backdrop: painted the backdrop's own colour.
  const body = rect(120, 120, 220, 330);
  const clear = photograph(340, 420, [{ points: body, paint: [212, 208, 202] }]);
  const traced = { method: 'traced' as const, body };
  const alphaAtCentre = (opaque: boolean) => {
    const r = makeRelief(clear, { outline: traced, opaque });
    if (!r.ok) throw new Error('no relief');
    return r.cutout.data[((r.cutout.height >> 1) * r.cutout.width + (r.cutout.width >> 1)) * 4 + 3]!;
  };

  it('lets the room show through clear glass', () => {
    expect(alphaAtCentre(false)).toBeLessThan(110);
    expect(alphaAtCentre(false)).toBeGreaterThan(50);
  });

  it('keeps frosted glass solid', () => {
    expect(alphaAtCentre(true)).toBeGreaterThan(245);
  });
});

describe('placement and size rules', () => {
  it('accepts what the pipeline makes and refuses the impossible', () => {
    expect(objectionsToReliefPlacement({ centreX: 0.5, centreY: 0.5, height: 0.7, angle: 28 })).toEqual([]);
    expect(objectionsToReliefPlacement({ centreX: 1.2, centreY: 0.5, height: 0.7, angle: 0 })).toEqual(['placement_out_of_range']);
    expect(objectionsToReliefPlacement({ centreX: 0.5, centreY: 0.5, height: 0, angle: 0 })).toEqual(['placement_out_of_range']);
    expect(objectionsToReliefPlacement({ centreX: 0.5, centreY: 0.5, height: 0.5, angle: Number.NaN })).toEqual(['placement_out_of_range']);
  });

  it('reduces a large photograph to the working size and never enlarges a small one', () => {
    expect(workingSize(2800, 3500)).toEqual({ width: 1120, height: RELIEF_LIMITS.workingEdge });
    expect(workingSize(800, 1000)).toEqual({ width: 800, height: 1000 });
  });
});
