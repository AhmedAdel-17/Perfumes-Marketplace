/**
 * The mask that writes a heading in ink (L'Encre — Les Détails, founder 19 Oct
 * 2026; design-reference/experiences/04-details.html, No. 04).
 *
 * Three headings wide: written at one end, clear at the other, and between
 * them a RAGGED FRONT — three sines out of phase, so no two headings are
 * written alike — with grain where the ink is still soaking into the fibres and
 * a few blots running ahead of it. Sliding the mask across the heading moves
 * the front over the words.
 *
 * Which end is written depends on the reading direction, and that is the whole
 * point of computing it rather than drawing it: Arabic is written from the
 * right, so the ink must arrive from the right (CLAUDE.md §14: meters and
 * progress run from the reading start, and this is progress). `direction`
 * decides which side of the front holds ink; the stylesheet slides the mask
 * the matching way.
 *
 * Pure, so the direction is asserted in a test rather than eyeballed: the
 * component only copies `alpha` into a canvas and draws the blots it lists.
 */
export type InkDirection = 'rtl' | 'ltr';

export interface InkMask {
  /** In mask pixels — three times the heading's width, at `scale`. */
  readonly width: number;
  readonly height: number;
  /** One opacity per pixel, row by row: 255 shows the heading, 0 hides it. */
  readonly alpha: Uint8ClampedArray;
  /** Drops of ink ahead of the front, to be drawn as soft discs. */
  readonly blots: ReadonlyArray<{ readonly x: number; readonly y: number; readonly r: number }>;
}

/**
 * @param w, h   the heading's box, in CSS pixels
 * @param scale  mask pixels per CSS pixel; the edge is soft, so half is plenty
 */
export function inkMask(w: number, h: number, direction: InkDirection, scale = 0.5, random: () => number = Math.random): InkMask {
  const width = Math.max(3, Math.ceil(w * 3 * scale));
  const height = Math.max(1, Math.ceil(h * scale));
  const phase = [random() * 10, random() * 10, random() * 10];
  // The front, in mask pixels: the amplitudes are CSS pixels, scaled.
  const front = (y: number) => {
    const yy = y / scale;
    return width / 2 + scale * (22 * Math.sin(yy * 0.045 + phase[0]!) + 12 * Math.sin(yy * 0.12 + phase[1]!) + 6 * Math.sin(yy * 0.31 + phase[2]!));
  };
  // Which side of the front is written: the reading end.
  const side = direction === 'rtl' ? 1 : -1;
  const soft = 22 * scale;
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const f = front(y);
    for (let x = 0; x < width; x++) {
      let a = Math.min(1, Math.max(0, 0.5 + (side * (x - f)) / soft));
      // Grain only in the wet edge: fully written or fully clear stays clean.
      a = Math.min(1, Math.max(0, a + (random() - 0.5) * 0.5 * (1 - Math.abs(2 * a - 1))));
      alpha[y * width + x] = Math.round(a * 255);
    }
  }
  const blots = Array.from({ length: Math.max(6, Math.round(46 * (h / 90))) }, () => {
    const y = random() * height;
    return { x: front(y) - side * scale * (8 + random() * 46), y, r: scale * (1.5 + random() * 6) };
  });
  return { width, height, alpha, blots };
}
