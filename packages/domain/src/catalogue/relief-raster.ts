/**
 * The image arithmetic the relief pipeline is built from — pure, and nothing
 * else (see `relief.ts` for what it is used to make).
 *
 * Pattern — a library of PURE FILTERS (Pipes and Filters, ENGINEERING_PRINCIPLES
 * §4: each stage a function from an image to an image, with no state and no
 * I/O). Nothing here knows what a canvas, a file or a browser is: an adapter
 * decodes the photograph into the `Rgba` shape below and encodes the results
 * back, which is what lets every step be tested in microseconds with images
 * built from numbers.
 *
 * Each filter is the exact or standard form, chosen for being linear-time on a
 * photograph of a million and a half pixels, in a browser worker:
 *   - polygon coverage by scanline, anti-aliased by measured span overlap;
 *   - Gaussian blur as three box blurs (the classic approximation, error under
 *     3%), each a running sum, so its cost does not grow with the radius;
 *   - the exact Euclidean distance transform (Felzenszwalb & Huttenlocher);
 *   - rotation by inverse mapping with bilinear sampling of PREMULTIPLIED
 *     colour, which is what keeps a dark fringe off a see-through edge.
 */

/** An image in memory: RGBA, eight bits a channel, row-major — what a canvas gives and takes. */
export interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** One channel of numbers, row-major — a mask, a distance, a height. */
export interface Plane {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export type Point = readonly [number, number];

export const plane = (width: number, height: number, fill = 0): Plane => {
  const data = new Float32Array(width * height);
  if (fill !== 0) data.fill(fill);
  return { width, height, data };
};

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ polygons

/**
 * How much of each pixel the polygon covers, 0 to 1 — an anti-aliased mask.
 *
 * Each pixel row is cut by `rows` scanlines; on each, the even-odd crossings
 * give spans, and every span adds to each pixel exactly the fraction of it that
 * it overlaps. So the edge is measured, not guessed, horizontally, and averaged
 * over the sub-rows vertically.
 */
export function polygonCoverage(width: number, height: number, points: readonly Point[], rows = 4): Plane {
  const out = plane(width, height);
  if (points.length < 3) return out;
  const n = points.length;
  const crossings: number[] = [];
  const weight = 1 / rows;
  for (let y = 0; y < height; y++) {
    for (let k = 0; k < rows; k++) {
      const sy = y + (k + 0.5) / rows;
      crossings.length = 0;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = points[i]!;
        const [x1, y1] = points[(i + 1) % n]!;
        // Half-open in y, so a vertex on the scanline is counted once.
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
          crossings.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let c = 0; c + 1 < crossings.length; c += 2) {
        const a = Math.max(0, crossings[c]!), b = Math.min(width, crossings[c + 1]!);
        if (b <= a) continue;
        const first = Math.floor(a), last = Math.min(width - 1, Math.floor(b - 1e-9));
        for (let x = first; x <= last; x++) {
          const overlap = Math.min(b, x + 1) - Math.max(a, x);
          if (overlap > 0) out.data[y * width + x]! += overlap * weight;
        }
      }
    }
  }
  return out;
}

export function centroid(points: readonly Point[]): Point {
  // The area centroid, not the mean of the corners: a polygon traced with many
  // points along one side must not lean its centre toward that side.
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const sx = points.reduce((s, p) => s + p[0], 0), sy = points.reduce((s, p) => s + p[1], 0);
    return [sx / points.length, sy / points.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// ------------------------------------------------------------------ blur

/** The three box widths whose repeated application best matches a Gaussian of `sigma`. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? lower : upper));
}

function boxPass(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean): void {
  const scale = 1 / (2 * radius + 1);
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    // A running sum over a window that is zero outside the image: the same
    // treatment a numerator and its weight get in a normalised convolution.
    let sum = 0;
    for (let i = 0; i <= Math.min(radius, length - 1); i++) sum += src[base + i * stride]!;
    for (let i = 0; i < length; i++) {
      dst[base + i * stride] = sum * scale;
      const enter = i + radius + 1, leave = i - radius;
      if (enter < length) sum += src[base + enter * stride]!;
      if (leave >= 0) sum -= src[base + leave * stride]!;
    }
  }
}

/** A Gaussian blur, zero beyond the edges. `sigma` in pixels; below ~0.3 it returns a copy. */
export function gaussianBlur(input: Plane, sigma: number): Plane {
  const { width, height } = input;
  const a = new Float32Array(input.data);
  if (sigma < 0.3) return { width, height, data: a };
  const b = new Float32Array(a.length);
  for (const size of boxesForGauss(sigma)) {
    const radius = (size - 1) / 2;
    boxPass(a, b, width, height, radius, true);
    boxPass(b, a, width, height, radius, false);
  }
  return { width, height, data: a };
}

// ------------------------------------------------------------------ scale

/** The plane reduced by `factor`, each output pixel the mean of its block. */
export function reduce(input: Plane, factor: number): Plane {
  if (factor <= 1) return { width: input.width, height: input.height, data: new Float32Array(input.data) };
  const w = Math.ceil(input.width / factor), h = Math.ceil(input.height / factor);
  const out = plane(w, h), count = new Float32Array(w * h);
  for (let y = 0; y < input.height; y++) {
    const oy = Math.floor(y / factor);
    for (let x = 0; x < input.width; x++) {
      const o = oy * w + Math.floor(x / factor);
      out.data[o]! += input.data[y * input.width + x]!;
      count[o]!++;
    }
  }
  for (let i = 0; i < out.data.length; i++) out.data[i] = out.data[i]! / count[i]!;
  return out;
}

/** A reduced plane brought back to `width` × `height`, bilinearly. */
export function enlarge(input: Plane, width: number, height: number): Plane {
  const out = plane(width, height);
  const fx = input.width / width, fy = input.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(input.height - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(input.height - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(input.width - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(input.width - 1, x0 + 1), tx = sx - x0;
      const a = input.data[y0 * input.width + x0]!, b = input.data[y0 * input.width + x1]!;
      const c = input.data[y1 * input.width + x0]!, d = input.data[y1 * input.width + x1]!;
      out.data[y * width + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

// ------------------------------------------------------------------ distance

const INF = 1e20;

/** One line of the squared-distance transform (Felzenszwalb & Huttenlocher, 2012). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
}

/**
 * For every pixel, the distance in pixels to the nearest pixel where `inside`
 * is false — zero outside.
 *
 * `beyond` says what lies past the edge of the image. `outside` for a relief,
 * so an object touching the edge still has an edge there; `inside` for a
 * morphological step, which must not grow or shrink anything at the frame
 * just because the picture ends.
 */
export function distanceInside(
  width: number, height: number, inside: (i: number) => boolean, beyond: 'outside' | 'inside' = 'outside',
): Plane {
  // Padded by one pixel all round.
  const pw = width + 2, ph = height + 2;
  const grid = new Float64Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const ix = x - 1, iy = y - 1;
      const inImage = ix >= 0 && iy >= 0 && ix < width && iy < height;
      const isIn = inImage ? inside(iy * width + ix) : beyond === 'inside';
      grid[y * pw + x] = isIn ? INF : 0;
    }
  }
  const longest = Math.max(pw, ph);
  const f = new Float64Array(longest), d = new Float64Array(longest);
  const v = new Int32Array(longest), z = new Float64Array(longest + 1);
  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) f[y] = grid[y * pw + x]!;
    edt1d(f, ph, d, v, z);
    for (let y = 0; y < ph; y++) grid[y * pw + x] = d[y]!;
  }
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) f[x] = grid[y * pw + x]!;
    edt1d(f, pw, d, v, z);
    for (let x = 0; x < pw; x++) grid[y * pw + x] = d[x]!;
  }
  const out = plane(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out.data[y * width + x] = Math.sqrt(grid[(y + 1) * pw + x + 1]!);
  }
  return out;
}

// ------------------------------------------------------------------ regions

/**
 * The largest 8-connected region of `on` pixels, as a 0/1 plane. Returns the
 * region's pixel count too, so a caller can judge whether anything was found.
 */
export function largestRegion(width: number, height: number, on: Uint8Array): { mask: Uint8Array; size: number } {
  const label = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let best = 0, bestSize = 0, next = 0;
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || label[start]) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = start; label[start] = next;
    while (top > 0) {
      const i = stack[--top]!;
      size++;
      const x = i % width, y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const j = ny * width + nx;
          if (on[j] && !label[j]) { label[j] = next; stack[top++] = j; }
        }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  const mask = new Uint8Array(width * height);
  if (best) for (let i = 0; i < mask.length; i++) mask[i] = label[i] === best ? 1 : 0;
  return { mask, size: bestSize };
}

/** `mask` with every enclosed hole filled: what the edge of the image cannot reach is inside. */
export function fillHoles(width: number, height: number, mask: Uint8Array): Uint8Array {
  const reached = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  const seed = (i: number) => { if (!mask[i] && !reached[i]) { reached[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % width, y = (i - x) / width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (y > 0) seed(i - width);
    if (y < height - 1) seed(i + width);
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !reached[i] ? 1 : 0;
  return out;
}

/** The threshold that best separates a histogram's two populations (Otsu, 1979). */
export function otsu(values: Float32Array, bins = 256, max = 1): number {
  const hist = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((values[i]! / max) * bins)));
    hist[b]!++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let b = 0; b < bins; b++) sumAll += b * hist[b]!;
  let sumB = 0, wB = 0, best = 0, bestBetween = -1;
  for (let b = 0; b < bins; b++) {
    wB += hist[b]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += b * hist[b]!;
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestBetween) { bestBetween = between; best = b; }
  }
  return ((best + 1) / bins) * max;
}

// ------------------------------------------------------------------ rotation

/**
 * Turning an image by `degrees` counter-clockwise (as it looks on screen) into
 * a canvas just large enough to hold all of it: the size of that canvas, and
 * the mapping from a point in it back to the source.
 */
export function rotation(width: number, height: number, degrees: number) {
  const a = (degrees * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  // Screen coordinates run downward, so a counter-clockwise turn sends +x toward -y.
  const forward = (x: number, y: number): Point => [x * cos + y * sin, -x * sin + y * cos];
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => forward(x! - width / 2, y! - height / 2));
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const outWidth = Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs) - 1e-6));
  const outHeight = Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys) - 1e-6));
  /** A point in the turned canvas, back in the source. */
  const toSource = (x: number, y: number): Point => {
    const dx = x - outWidth / 2, dy = y - outHeight / 2;
    return [dx * cos - dy * sin + width / 2, dx * sin + dy * cos + height / 2];
  };
  return { width: outWidth, height: outHeight, toSource };
}

/** Bilinear sample of a plane at a real position (pixel centres at +0.5); zero outside. */
function samplePlane(p: Plane, x: number, y: number): number {
  const fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= p.width || yy >= p.height ? 0 : p.data[yy * p.width + xx]!);
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

/** Turns planes together — premultiplied colour and alpha are turned as planes, then divided. */
export function rotatePlanes(planes: readonly Plane[], degrees: number): { planes: Plane[]; toSource: (x: number, y: number) => Point } {
  const { width, height } = planes[0]!;
  const r = rotation(width, height, degrees);
  const out = planes.map(() => plane(r.width, r.height));
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const [sx, sy] = r.toSource(x + 0.5, y + 0.5);
      for (let k = 0; k < planes.length; k++) out[k]!.data[y * r.width + x] = samplePlane(planes[k]!, sx, sy);
    }
  }
  return { planes: out, toSource: r.toSource };
}
