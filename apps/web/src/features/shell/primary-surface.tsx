/**
 * The look of a primary action, shared by server and client components.
 *
 * NO `'use client'` DIRECTIVE, and that is the entire reason this file exists
 * separately from `PrimaryButton.tsx`.
 *
 * A plain constant exported from a `'use client'` module does not cross back to
 * the server as a value. It arrives as a client reference — a stub function
 * that throws if called — and interpolating it into a template string produces
 * the TEXT OF THAT ERROR. Which is what happened: a server component imported
 * `primarySurface`, joined it into a className, and the buy button rendered
 * twenty-one pixels tall wearing a stringified exception as its class list.
 *
 * Nothing threw. TypeScript was satisfied — the type is `string` on both sides.
 * The audit caught it as a tap-target failure, three steps from the cause.
 *
 * A module with no directive is usable from both sides, so shared VALUES live
 * here and the interactive component stays in the client module.
 */
import { color } from '@diyar/tokens';

/** Lighten or darken a token toward white or black, for the gradient stops. */
const shift = (hex: string, amount: number): string => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as
    [number, number, number];
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Three stops rather than a flat fill.
 *
 * A flat brass slab with a bold label is a framework button wearing a brand
 * colour; a shallow vertical ramp gives the surface a light direction, and the
 * hairline along its top edge is where that light catches.
 */
const SURFACE = [
  'linear-gradient(180deg,',
  `${shift(color.brass, 0.12)} 0%,`,
  `${color.brass} 52%,`,
  `${shift(color.brass, -0.14)} 100%)`,
].join('');

/**
 * The label is LETTERSPACED at normal weight: bold type on a saturated ground
 * is the loudest thing an interface can do, and law VII is never shout.
 */
export const primarySurface = [
  'relative flex h-control items-center justify-center overflow-hidden rounded-sm',
  'text-bodyLg font-medium tracking-[1.2px] text-on-accent',
  'transition-[filter,opacity] duration-base ease-out',
  'hover:brightness-110 active:opacity-press',
  'disabled:opacity-disabled disabled:brightness-75',
].join(' ');

export const primarySurfaceStyle = { backgroundImage: SURFACE } as const;

/** The hairline where the light catches. Rendered inside every primary action. */
export function PrimaryHighlight() {
  return <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />;
}
