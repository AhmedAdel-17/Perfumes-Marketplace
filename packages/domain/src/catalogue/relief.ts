/**
 * A perfume's RELIEF — its bottle lifted out of its photograph, so the
 * storefront can stand it up, light it and turn it (Le Dévoilement, founder
 * 18–19 Oct 2026; design-reference/experiences/01-devoilement.html).
 *
 * From ONE photograph this makes:
 *   1. the CUT-OUT — the bottle alone, its glass see-through where the wall
 *      showed through it, stood upright and cropped (RGBA);
 *   2. the RELIEF MAP — how far each pixel stands out: flat faces with rounded
 *      edges for the body, a rounded profile across a cap (greyscale), from
 *      which the browser computes normals and relights the glass;
 *   3. the PLACEMENT — where the cut-out sat in the photograph (centre, height,
 *      angle), so the object can be laid exactly over the bottle in the
 *      picture before it is lifted out of it.
 *
 * HONESTY. Nothing about the packaging is invented: every pixel of the object
 * is the house's own photograph, and the relief only rounds the edges it
 * already has. That is why this is not a generated 3D model — a model would
 * draw a back of the bottle nobody photographed (CLAUDE.md §4: never present a
 * guess about a seller's product as fact).
 *
 * WHERE THE OUTLINE COMES FROM — the founder's choice of 19 Oct 2026:
 *   - `automatic`, for a photograph on a plain background (the packshot every
 *     listing should have): the background is modelled from the border and
 *     the bottle is what differs from it;
 *   - `traced`, for anything else: an operator clicks around the body, and the
 *     cap if it has one — how the three prototypes were made.
 * No machine-learning model and no library: the whole pipeline is the
 * arithmetic below, run in the operator's browser.
 *
 * Pattern — PIPES AND FILTERS over pure functions (ENGINEERING_PRINCIPLES §4):
 * outline → mask → background → glass matte → relief → upright → crop →
 * placement, each stage a function of the previous, testable on its own. The
 * filters themselves are in `relief-raster.ts`.
 */
import {
  centroid, clamp01, distanceInside, enlarge, fillHoles, gaussianBlur, largestRegion, otsu, plane,
  polygonCoverage, reduce, rotatePlanes, type Plane, type Point, type Rgba,
} from './relief-raster';

export type { Plane, Point, Rgba } from './relief-raster';

export type ReliefMethod = 'automatic' | 'traced';
export const RELIEF_METHODS: readonly ReliefMethod[] = ['automatic', 'traced'];

export type ReliefOutline =
  | { readonly method: 'automatic' }
  | {
    readonly method: 'traced';
    /** The body's corners, in photograph pixels, in order around it. */
    readonly body: readonly Point[];
    /** The cap's, if the bottle has one: it is rounded across, not bevelled. */
    readonly cap?: readonly Point[];
  };

export interface ReliefInput {
  readonly outline: ReliefOutline;
  /** Frosted or opaque: nothing shows through it, so nothing is made see-through. */
  readonly opaque?: boolean;
}

export interface ReliefPlacement {
  /** The cut-out's centre in the photograph, as fractions of its width and height. */
  readonly centreX: number;
  readonly centreY: number;
  /** The cut-out's height as a fraction of the photograph's height. */
  readonly height: number;
  /** Degrees counter-clockwise that turn the upright cut-out to lie as photographed. */
  readonly angle: number;
}

export const RELIEF_OBJECTIONS = [
  'busy_background',
  'no_bottle_found',
  'bottle_cropped',
  'outline_invalid',
  'outline_too_small',
] as const;

export type ReliefObjection = (typeof RELIEF_OBJECTIONS)[number];

export type ReliefResult =
  | { readonly ok: true; readonly cutout: Rgba; readonly relief: Rgba; readonly placement: ReliefPlacement }
  | { readonly ok: false; readonly objections: readonly ReliefObjection[] };

/**
 * The limits, and the reason for each.
 *
 * `workingEdge` — the photograph is reduced to this on its longer side before
 * anything runs: the stage draws the bottle about 430 px tall, 860 on a
 * retina screen, so more is memory spent on nothing.
 *
 * `minFraction` / `maxFraction` — a "bottle" smaller than 3% of the picture is
 * a speck the segmentation found, and one over 85% is the background itself.
 *
 * `minEdge` / `maxEdge` — what an uploaded cut-out may measure. Smaller than a
 * photograph may (a slim bottle's cut-out is narrow), never absurd.
 */
export const RELIEF_LIMITS = {
  workingEdge: 1400,
  minFraction: 0.03,
  maxFraction: 0.85,
  minEdge: 48,
  maxEdge: 4000,
  maxBytes: 8 * 1024 * 1024,
} as const;

/**
 * The pipeline's tuning, named — each value is the prototype's, judged by eye
 * on the founder's three bottles (18 Oct 2026).
 *
 * `glassFloor` — the least opaque clear glass is allowed to be: even perfectly
 * clear glass reflects, and a bottle that vanished where it is clearest would
 * read as a hole. `glassRange` — how far a pixel must differ from the wall
 * behind it to count as solid. `capRise` — a cap stands a little less proud
 * than the body's faces, as a cylinder seen from the front does.
 * `backdropEnough` — the share of nearby pixels that must be backdrop for one
 * scale of `backgroundBehind` to be trusted.
 */
const TUNING = { glassFloor: 0.28, glassRange: 0.22, capRise: 0.85, backdropEnough: 0.08 } as const;

// ------------------------------------------------------------------ helpers

interface Colour { readonly r: Plane; readonly g: Plane; readonly b: Plane }

function channels(photo: Rgba): Colour {
  const { width, height, data } = photo;
  const r = plane(width, height), g = plane(width, height), b = plane(width, height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    r.data[i] = data[p]! / 255; g.data[i] = data[p + 1]! / 255; b.data[i] = data[p + 2]! / 255;
  }
  return { r, g, b };
}

/**
 * What was behind the bottle: the pixels where `weight` is high, carried in
 * over the pixels where it is low (a normalised convolution).
 *
 * At ONE scale that fails in the middle of a wide bottle, where no weighted
 * pixel is within reach of the blur: the estimate falls to black, and clear
 * glass there reads as solid. So the scale doubles until every pixel has
 * enough of the backdrop to go on, each scale filling only what the finer ones
 * could not. A backdrop is smooth by nature, so all of it runs on a copy
 * reduced to a third of `sigma` per pixel, and is enlarged at the end.
 */
function backgroundBehind(c: Colour, weight: Plane, sigma: number): Colour {
  const { width, height } = weight;
  const factor = Math.max(1, Math.floor(sigma / 3));
  const w = reduce(weight, factor);
  const weighted = (p: Plane): Plane => {
    const q = plane(width, height);
    for (let i = 0; i < q.data.length; i++) q.data[i] = p.data[i]! * weight.data[i]!;
    return reduce(q, factor);
  };
  const nums = [weighted(c.r), weighted(c.g), weighted(c.b)];
  const out = nums.map(() => plane(w.width, w.height));
  const have = new Float32Array(w.data.length);
  let s = sigma / factor;
  for (let k = 0; k < 8; k++, s *= 2) {
    const den = gaussianBlur(w, s);
    const blurred = nums.map((n) => gaussianBlur(n, s));
    let remaining = false;
    for (let i = 0; i < have.length; i++) {
      if (have[i]! >= 0.999) continue;
      const d = den.data[i]!;
      if (d > 1e-7) {
        const take = (1 - have[i]!) * Math.min(1, d / TUNING.backdropEnough);
        for (let ch = 0; ch < 3; ch++) out[ch]!.data[i]! += (take * blurred[ch]!.data[i]!) / d;
        have[i]! += take;
      }
      if (have[i]! < 0.999) remaining = true;
    }
    if (!remaining) break;
  }
  // Whatever no scale reached takes the backdrop's mean.
  let total = 0;
  for (let i = 0; i < w.data.length; i++) total += w.data[i]!;
  const means = nums.map((n) => n.data.reduce((acc, v) => acc + v, 0) / Math.max(total, 1e-6));
  for (let i = 0; i < have.length; i++) {
    const rest = 1 - have[i]!;
    if (rest > 0) for (let ch = 0; ch < 3; ch++) out[ch]!.data[i]! += rest * means[ch]!;
  }
  return { r: enlarge(out[0]!, width, height), g: enlarge(out[1]!, width, height), b: enlarge(out[2]!, width, height) };
}

const distanceFrom = (c: Colour, bg: Colour, i: number): number => Math.hypot(
  c.r.data[i]! - bg.r.data[i]!, c.g.data[i]! - bg.g.data[i]!, c.b.data[i]! - bg.b.data[i]!,
);

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values.length ? values[values.length >> 1]! : 0;
}

// ------------------------------------------------------------------ automatic outline

/**
 * The bottle in a packshot: what differs from a background modelled from the
 * border of the picture.
 *
 * A busy border is refused rather than guessed at — a photograph of a bottle
 * on sand or among flowers is exactly where a wrong guess would cut off a
 * shoulder, and an operator tracing it takes a minute.
 */
function automaticMask(c: Colour, width: number, height: number): { mask: Plane } | { objection: ReliefObjection } {
  const margin = Math.max(2, Math.round(0.02 * Math.min(width, height)));
  const border: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= margin && y >= margin && x < width - margin && y < height - margin) continue;
      border.push(y * width + x);
    }
  }
  const med = {
    r: median(border.map((i) => c.r.data[i]!)),
    g: median(border.map((i) => c.g.data[i]!)),
    b: median(border.map((i) => c.b.data[i]!)),
  };
  // The MEDIAN distance from the border's colour: a bottle reaching into one
  // edge must not make a plain backdrop look busy — that is a cropped bottle,
  // and is reported as one below.
  const spread = median(border.map((i) => Math.hypot(c.r.data[i]! - med.r, c.g.data[i]! - med.g, c.b.data[i]! - med.b)));
  if (spread > 0.09) return { objection: 'busy_background' };

  // A first, rough foreground — then the background is re-modelled around it,
  // so a gradient or a vignette in the backdrop is not mistaken for a bottle.
  const rough = plane(width, height);
  const t0 = Math.max(0.08, spread * 3);
  for (let i = 0; i < width * height; i++) {
    const d = Math.hypot(c.r.data[i]! - med.r, c.g.data[i]! - med.g, c.b.data[i]! - med.b);
    rough.data[i] = d > t0 ? 0 : 1;
  }
  const bg = backgroundBehind(c, rough, 0.04 * Math.max(width, height));
  const difference = plane(width, height);
  for (let i = 0; i < width * height; i++) difference.data[i] = distanceFrom(c, bg, i);
  const smooth = gaussianBlur(difference, 1);
  const threshold = Math.max(0.06, otsu(smooth.data, 256, 1.8));

  const on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) on[i] = smooth.data[i]! > threshold ? 1 : 0;

  // Close the small gaps a glass edge leaves (dilate, then erode, by r).
  const r = Math.max(2, Math.round(0.006 * Math.max(width, height)));
  const outside = distanceInside(width, height, (i) => !on[i], 'inside');
  const dilated = new Uint8Array(on.length);
  for (let i = 0; i < on.length; i++) dilated[i] = on[i] || outside.data[i]! <= r ? 1 : 0;
  const fromEdge = distanceInside(width, height, (i) => dilated[i] === 1, 'inside');
  const closed = new Uint8Array(on.length);
  for (let i = 0; i < on.length; i++) closed[i] = fromEdge.data[i]! > r ? 1 : 0;

  const { mask: region, size } = largestRegion(width, height, closed);
  const fraction = size / (width * height);
  if (fraction < RELIEF_LIMITS.minFraction || fraction > RELIEF_LIMITS.maxFraction) return { objection: 'no_bottle_found' };

  // Clear glass shows the wall through it, and a wall is what this removes: the
  // inside of the outline is the bottle whatever colour it shows.
  const solid = fillHoles(width, height, region);

  // A bottle the frame cuts off cannot be stood up whole.
  const touches = (count: number, length: number) => count > 0.08 * length;
  let top = 0, bottom = 0, left = 0, right = 0;
  for (let x = 0; x < width; x++) { top += solid[x]!; bottom += solid[(height - 1) * width + x]!; }
  for (let y = 0; y < height; y++) { left += solid[y * width]!; right += solid[y * width + width - 1]!; }
  if (touches(top, width) || touches(bottom, width) || touches(left, height) || touches(right, height)) {
    return { objection: 'bottle_cropped' };
  }

  const mask = plane(width, height);
  for (let i = 0; i < solid.length; i++) mask.data[i] = solid[i]!;
  // An anti-aliased edge, not a staircase.
  return { mask: gaussianBlur(mask, 0.8) };
}

// ------------------------------------------------------------------ the pipeline

const isTracedValid = (points: readonly Point[] | undefined) =>
  !!points && points.length >= 3 && points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

/**
 * The relief of the bottle in `photo`. The photograph should already be at
 * most `RELIEF_LIMITS.workingEdge` on its longer side — the caller reduces it,
 * because reducing is decoding, and decoding is the adapter's job.
 */
export function makeRelief(photo: Rgba, input: ReliefInput): ReliefResult {
  const { width, height } = photo;
  const c = channels(photo);
  const scale = Math.max(width, height) / 1250;

  // 1. The outline: a body, and perhaps a cap.
  let body: Plane, cap: Plane | null = null;
  let up: Point = [0, -1];
  if (input.outline.method === 'traced') {
    const traced = input.outline;
    if (!isTracedValid(traced.body) || (traced.cap !== undefined && !isTracedValid(traced.cap))) {
      return { ok: false, objections: ['outline_invalid'] };
    }
    body = polygonCoverage(width, height, traced.body);
    if (traced.cap) {
      cap = polygonCoverage(width, height, traced.cap);
      // Up is from the body's centre to the cap's: the direction the bottle
      // stands in, however it lies in the picture.
      const [bx, by] = centroid(traced.body), [cx, cy] = centroid(traced.cap);
      const len = Math.hypot(cx - bx, cy - by);
      if (len > 1) up = [(cx - bx) / len, (cy - by) / len];
    }
  } else {
    const found = automaticMask(c, width, height);
    if ('objection' in found) return { ok: false, objections: [found.objection] };
    body = found.mask;
  }
  const mask = plane(width, height);
  let covered = 0;
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = clamp01(body.data[i]! + (cap ? cap.data[i]! : 0));
    covered += mask.data[i]!;
  }
  if (covered < 0.005 * width * height) return { ok: false, objections: ['outline_too_small'] };

  // 2. The glass: where the wall showed through, let it show through again —
  //    and un-mix the wall from those pixels, so clear glass keeps its own tint.
  const outside = plane(width, height);
  for (let i = 0; i < outside.data.length; i++) outside.data[i] = mask.data[i]! < 0.02 ? 1 : 0;
  const bg = backgroundBehind(c, outside, 28 * scale);
  const glass = plane(width, height);
  for (let i = 0; i < glass.data.length; i++) {
    glass.data[i] = Math.min(1, TUNING.glassFloor + distanceFrom(c, bg, i) / TUNING.glassRange);
  }
  const glassSoft = gaussianBlur(glass, 1.2);
  const alpha = plane(width, height);
  for (let i = 0; i < alpha.data.length; i++) {
    const isCap = cap ? cap.data[i]! > 0.5 : false;
    alpha.data[i] = mask.data[i]! * (input.opaque || isCap ? 1 : glassSoft.data[i]!);
  }

  // 3. The relief: flat faces with rounded edges; a cap round across its axis.
  const inBody = distanceInside(width, height, (i) => body.data[i]! > 0.5);
  let bx0 = width, bx1 = 0, by0 = height, by1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (body.data[y * width + x]! <= 0.5) continue;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
  const bevel = Math.min(40, Math.max(6, 0.05 * Math.min(bx1 - bx0 + 1, by1 - by0 + 1)));
  const relief = plane(width, height);
  let lo = Infinity, hi = -Infinity;
  if (cap) {
    for (let i = 0; i < relief.data.length; i++) {
      if (cap.data[i]! <= 0.5) continue;
      const x = i % width, y = (i - x) / width;
      const across = x * -up[1] + y * up[0];
      if (across < lo) lo = across;
      if (across > hi) hi = across;
    }
  }
  for (let i = 0; i < relief.data.length; i++) {
    if (mask.data[i]! <= 0.5) continue;
    if (cap && cap.data[i]! > 0.5) {
      const x = i % width, y = (i - x) / width;
      const t = Math.max(-1, Math.min(1, ((x * -up[1] + y * up[0] - lo) / Math.max(hi - lo, 1)) * 2 - 1));
      relief.data[i] = Math.sqrt(Math.max(0, 1 - t * t)) * TUNING.capRise;
    } else {
      relief.data[i] = Math.pow(clamp01(inBody.data[i]! / bevel), 0.55);
    }
  }
  const reliefSoft = gaussianBlur(relief, 1.6 * scale);

  // 4. The bottle's own colour: the matting equation, observed = a·fg + (1−a)·bg,
  //    solved for fg — then premultiplied by its alpha, which is the form that
  //    survives being resampled without a dark fringe at a see-through edge.
  const matte = (observed: Plane, behind: Plane): Plane => {
    const p = plane(width, height);
    for (let i = 0; i < p.data.length; i++) {
      const a = alpha.data[i]!;
      p.data[i] = clamp01((observed.data[i]! - (1 - a) * behind.data[i]!) / Math.max(a, 0.05)) * a;
    }
    return p;
  };

  // 5. Stand it up: turn the picture so `up` points to the top. `turn` is the
  //    counter-clockwise turn that does it — negative for a cap leaning left.
  const turn = (Math.atan2(up[0], -up[1]) * 180) / Math.PI;
  const turned = rotatePlanes([matte(c.r, bg.r), matte(c.g, bg.g), matte(c.b, bg.b), alpha, reliefSoft], turn);
  const [pr, pg, pb, pa, ph] = turned.planes as [Plane, Plane, Plane, Plane, Plane];

  // 6. Crop to the bottle, with room for the edge highlights.
  const W = pa.width, H = pa.height;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pa.data[y * W + x]! <= 8 / 255) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { ok: false, objections: ['no_bottle_found'] };
  const pad = Math.round(24 * scale);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const cutout = new Uint8ClampedArray(cw * ch * 4), reliefOut = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = (y + y0) * W + (x + x0), d = (y * cw + x) * 4;
      const a = pa.data[s]!;
      const un = (v: number) => (a > 1e-4 ? (v / a) * 255 : 0);
      cutout[d] = un(pr.data[s]!); cutout[d + 1] = un(pg.data[s]!); cutout[d + 2] = un(pb.data[s]!); cutout[d + 3] = a * 255;
      const h = clamp01(ph.data[s]!) * 255;
      reliefOut[d] = h; reliefOut[d + 1] = h; reliefOut[d + 2] = h; reliefOut[d + 3] = 255;
    }
  }

  // 7. Where it sat: the crop's centre, mapped back into the photograph, and the
  //    turn that lays the upright cut-out back down as it was photographed.
  const [sx, sy] = turned.toSource(x0 + cw / 2, y0 + ch / 2);
  return {
    ok: true,
    cutout: { width: cw, height: ch, data: cutout },
    relief: { width: cw, height: ch, data: reliefOut },
    placement: { centreX: sx / width, centreY: sy / height, height: ch / height, angle: turn === 0 ? 0 : -turn },
  };
}

/** Whether a placement read from outside (an operator's browser) is one this could have made. */
export function objectionsToReliefPlacement(p: ReliefPlacement): Array<'placement_out_of_range'> {
  const ok = Number.isFinite(p.centreX) && Number.isFinite(p.centreY) && Number.isFinite(p.height) && Number.isFinite(p.angle)
    && p.centreX >= 0 && p.centreX <= 1 && p.centreY >= 0 && p.centreY <= 1
    && p.height > 0 && p.height <= 2 && p.angle >= -180 && p.angle <= 180;
  return ok ? [] : ['placement_out_of_range'];
}

/** The size to reduce a photograph to before `makeRelief`: never enlarged. */
export function workingSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, RELIEF_LIMITS.workingEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
