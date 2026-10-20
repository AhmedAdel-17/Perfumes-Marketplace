/**
 * A perfume's day on the skin — an ILLUSTRATION of the bands its house
 * declared, for the dial on the product page (La Durée, founder 19 Oct 2026;
 * design-reference/experiences/02-la-duree.html).
 *
 * A perfume is not one smell but a sequence: the top notes go first, the heart
 * holds for hours, the base is what is left by evening. The dial draws that
 * sequence over a twelve-hour face, and every shape on it comes from two
 * controlled words — the longevity band and the projection band — and nothing
 * else. It is a drawing of what those words mean, never a measurement, and the
 * page says so beside it with the band's source (CLAUDE.md §4: a seller claim
 * is never presented as platform fact). Which is also why nothing here is ever
 * printed as "lasts N hours": a band is a word, never a number (vocabularies).
 *
 * Pure: the dial's component draws what this returns, and the tests hold the
 * shape of a day to the words it illustrates.
 */
import type { LongevityBand, ProjectionBand } from './vocabularies';
import { LONGEVITY_BANDS, PROJECTION_BANDS } from './vocabularies';
import { NOTE_TIERS, type NoteTier } from './note-index';

/** The dial's face: twelve hours from the spray. */
export const DIAL_HOURS = 12;

/**
 * How far round the face each declared longevity band is DRAWN — the base's
 * last trace. Illustrative spacing of four words along one face, in order; it
 * is not a duration the platform asserts, and it is never printed.
 */
const SPAN: Record<LongevityBand, number> = { weak: 3, moderate: 5, long: 8, very_long: 11 };

/** How far the perfume's air reaches around the dial at its strongest, for each projection band. */
const REACH: Record<ProjectionBand, number> = { intimate: 0.62, moderate: 0.78, strong: 0.94, enormous: 1.08 };

/** How strongly each tier is drawn when it is at its fullest: the opening is the brightest. */
export const TIER_WEIGHT: Readonly<Record<NoteTier, number>> = { top: 1, heart: 0.85, base: 0.72 };

/** When a tier is there, in hours from the spray: rising, at its fullest, fading, gone. */
export interface TierEnvelope {
  readonly start: number;
  readonly peakStart: number;
  readonly peakEnd: number;
  readonly end: number;
}

export interface SkinDay {
  /** Where the last trace is drawn, in hours of the face. */
  readonly span: number;
  /** How far its air reaches at its strongest, relative to the dial. */
  readonly reach: number;
  readonly tiers: Readonly<Record<NoteTier, TierEnvelope>>;
}

export const isLongevityBand = (value: string): value is LongevityBand =>
  (LONGEVITY_BANDS as readonly string[]).includes(value);
export const isProjectionBand = (value: string): value is ProjectionBand =>
  (PROJECTION_BANDS as readonly string[]).includes(value);

/**
 * Where the heart and the base turn, as SHARES of the drawn span — the shape
 * of a day, the same for every perfume; only the span changes with the band.
 */
const SHARE = { heartFull: 0.45, heartGone: 0.72, baseFull: 0.8, baseRisen: 0.4 } as const;

export function skinDay(longevity: LongevityBand, projection: ProjectionBand): SkinDay {
  const span = SPAN[longevity];
  return {
    span,
    reach: REACH[projection],
    tiers: {
      // The opening: there at the spray, gone before the first hour is out.
      top: { start: 0, peakStart: 0, peakEnd: 0.2, end: 0.8 },
      heart: { start: 0.12, peakStart: 0.6, peakEnd: span * SHARE.heartFull, end: span * SHARE.heartGone },
      base: { start: 0.45, peakStart: Math.min(1.7, span * SHARE.baseRisen), peakEnd: span * SHARE.baseFull, end: span },
    },
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** How present a tier is at hour `t`: 0 before and after it, 1 at its fullest. */
export function presence(envelope: TierEnvelope, t: number): number {
  if (t < envelope.start || t > envelope.end) return 0;
  const rise = envelope.peakStart > envelope.start ? smooth(envelope.start, envelope.peakStart, t) : 1;
  return rise * (1 - smooth(envelope.peakEnd, envelope.end, t));
}

/**
 * Where each of a tier's notes sits on its ring, in hours: spread across the
 * hours the tier is strongest, in the order the house listed them.
 */
export function noteHours(day: SkinDay, tier: NoteTier, count: number): number[] {
  if (count <= 0) return [];
  const e = day.tiers[tier];
  const [a, b] = tier === 'top'
    ? [0.06, 0.62]
    : tier === 'heart'
      ? [e.peakStart + 0.2, Math.max(e.peakStart + 1, e.peakEnd)]
      : [e.peakStart + 0.8, Math.max(e.peakStart + 2, e.peakEnd)];
  return Array.from({ length: count }, (_, i) => (count === 1 ? (a + b) / 2 : a + ((b - a) * i) / (count - 1)));
}

export type DayPhase = NoteTier | 'trace';

/** Which part of the day the hand is in — what the dial's words describe. */
export function phaseAt(day: SkinDay, t: number): DayPhase {
  if (t < 0.42) return 'top';
  if (t > day.tiers.base.end - 0.3) return 'trace';
  const heart = presence(day.tiers.heart, t) * TIER_WEIGHT.heart;
  const base = presence(day.tiers.base, t) * TIER_WEIGHT.base;
  return heart >= base ? 'heart' : 'base';
}

/** The strongest tier's presence at hour `t`, 0 to 1 — how much of the perfume is there at all. */
export function strengthAt(day: SkinDay, t: number): number {
  return Math.max(...NOTE_TIERS.map((tier) => presence(day.tiers[tier], t) * TIER_WEIGHT[tier]));
}

/** How far the perfume's air reaches at hour `t`, relative to the dial: its strength, scaled by projection. */
export function sillageAt(day: SkinDay, t: number): number {
  return day.reach * (0.62 + 0.38 * strengthAt(day, t));
}
