/**
 * The loupe's arithmetic (Loupe.tsx), kept pure so its one promise is asserted
 * in a test: the glass never magnifies past the detail the house's photograph
 * holds, and where it would have too little to show there is no glass at all.
 */

/** The most the glass magnifies, as in the approved prototype. */
export const POWER = 2.4;
/** Below this, a glass shows the photograph barely larger — not worth raising. */
export const FLOOR = 1.3;

export interface Size { readonly w: number; readonly h: number }

export interface LensFit {
  /** Screen pixels per photograph pixel, as the frame shows it (`object-cover`). */
  readonly scale: number;
  /** Where the photograph's corner sits in the frame — negative where it is cropped. */
  readonly ox: number;
  readonly oy: number;
  /** The power the glass can honestly reach here. */
  readonly zoom: number;
  readonly usable: boolean;
}

/**
 * @param frame       the frame the photograph fills, in CSS pixels
 * @param natural     the photograph's own size, in pixels
 * @param sourceWidth how wide the large copy the glass loads really is
 */
export function lensFit(frame: Size, natural: Size, sourceWidth: number): LensFit {
  const scale = Math.max(frame.w / natural.w, frame.h / natural.h);
  // The large copy holds sourceWidth / natural.w of the photograph's pixels;
  // past that the glass would be enlarging pixels, not showing detail.
  const zoom = Math.min(POWER, sourceWidth / natural.w / scale);
  return {
    scale,
    ox: (frame.w - natural.w * scale) / 2,
    oy: (frame.h - natural.h * scale) / 2,
    zoom,
    usable: zoom >= FLOOR,
  };
}

/** Where the large copy lies behind a glass of `size`, so the point under the hand is at its centre. */
export function lensOffset(fit: LensFit, at: { readonly x: number; readonly y: number }, size: number): { x: number; y: number } {
  return { x: -(at.x - fit.ox) * fit.zoom + size / 2, y: -(at.y - fit.oy) * fit.zoom + size / 2 };
}
