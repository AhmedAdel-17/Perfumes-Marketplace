import { DIAL_HOURS, type NoteTier } from '@diyar/domain';

/**
 * The day-on-the-skin dial's face, as numbers: what the page draws on the
 * server and the controller moves in the browser both read it from here.
 *
 * Its own small module so the page can draw the face without loading the
 * controller, which arrives only as the dial comes into view.
 */

/** The face's geometry, in the SVG's units (a 640-unit square around the centre). */
export const R = { bezel: 300, tickOut: 292, tickIn: 284, majorIn: 274, numeral: 254, top: 226, heart: 190, base: 154, gOut: 128, gIn: 82, sub: 74 } as const;
export const RING: Readonly<Record<NoteTier, number>> = { top: R.top, heart: R.heart, base: R.base };

/** A point on the face at hour `h`, clockwise from the top — a clock never turns the other way round. */
export const polar = (r: number, h: number): [number, number] => {
  const a = (h / DIAL_HOURS) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
};
