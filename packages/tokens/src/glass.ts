/**
 * Deriving a glass palette from a scent-family token.
 *
 * A bottle is not one colour. Light entering glass is absorbed in proportion to
 * how far it travels through the material, so the same liquid reads almost
 * black at the edges (where the eye looks through the full width of the glass
 * plus the full width of the juice) and luminous at the centre. Fill a shape
 * with a single hex and it reads as a coloured rectangle, which is exactly what
 * it is.
 *
 * These stops are derived from `scentFamily` rather than authored, so a new
 * family needs one token and no artwork, and no shade can drift away from the
 * family colour it belongs to.
 */
import { scentFamily } from './index';

export type ScentFamily = keyof typeof scentFamily;

export interface GlassPalette {
  /** Through the full thickness — the silhouette edge. Nearly opaque. */
  edge: string;
  /** The body of the liquid. */
  deep: string;
  /** Where the light passes through least material. */
  core: string;
  /** Empty glass above the liquid line — desaturated, much lighter. */
  air: string;
  /** The light the bottle throws onto the surface it stands on. */
  caustic: string;
  /**
   * The perfume in the air: the family's colour as light, for the reveal's
   * mist and its notes on the dark stage (Le Dévoilement, 19 Oct 2026). The
   * lightest stop — mist is lit from within, never a shadow.
   */
  mist: string;
}

const clamp = (n: number): number => Math.min(255, Math.max(0, Math.round(n)));

const parse = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  if (h.length !== 6) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
};

const hex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** Toward black (t < 0) or toward the given light (t > 0). */
const mix = (colour: string, target: [number, number, number], t: number): string => {
  const [r, g, b] = parse(colour);
  return hex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t);
};

/** Warm white — the light source is a tungsten spot, never a screen's blue-white. */
const WARM_WHITE: [number, number, number] = [255, 238, 214];
const BLACK: [number, number, number] = [0, 0, 0];

/**
 * Empty glass above the liquid line.
 *
 * A fixed formula cannot work here, and the reason is worth stating: the
 * families do not share a value range. Amber sits at #A8681F and oud at
 * #4A3328, so a rule that darkens the liquid to get the empty glass separates
 * them beautifully for amber and collapses them completely for oud — the oud
 * flacon renders with no visible liquid line at all, which is the one detail
 * the eye uses to read a shape as a bottle. Caught by assertion, not by eye.
 *
 * So the empty glass steps AWAY from the liquid in whichever direction has
 * room. It is desaturated first either way, because empty glass takes its
 * colour from the room it stands in and not from what it used to hold.
 */
function emptyGlass(deep: string): string {
  const grey = desaturate(deep, 0.55);
  // Below this luminance the liquid is already near-black; darkening further
  // has nowhere to go, so the glass lifts toward the light instead.
  return luminance(deep) > 0.02 ? mix(grey, BLACK, 0.45) : mix(grey, WARM_WHITE, 0.16);
}

/** Toward the colour own average — losing chroma, keeping value. */
function desaturate(colour: string, t: number): string {
  const [r, g, b] = parse(colour);
  const avg = (r + g + b) / 3;
  return hex(r + (avg - r) * t, g + (avg - g) * t, b + (avg - b) * t);
}

export function glassPalette(family: ScentFamily | string): GlassPalette {
  const base = (scentFamily as Record<string, string>)[family] ?? scentFamily.amber;
  return {
    // The edge is nearly black. Glass photographs as a dark outline containing a
    // bright interior, and softening this stop is what turns a render to ceramic
    // — the first version sat at 0.78 and read as frosted plastic.
    edge: mix(base, BLACK, 0.9),
    deep: mix(base, BLACK, 0.5),
    core: mix(base, WARM_WHITE, 0.3),
    air: emptyGlass(mix(base, BLACK, 0.5)),
    caustic: mix(base, WARM_WHITE, 0.4),
    mist: mix(base, WARM_WHITE, 0.55),
  };
}

/** Relative luminance, for asserting the stops actually step. */
export function luminance(colour: string): number {
  const [r, g, b] = parse(colour).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
