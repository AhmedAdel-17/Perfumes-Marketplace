/**
 * Design tokens — the single source of truth.
 *
 * DESIGN_DOCTRINE.md: never hardcode a colour, size, spacing value or radius.
 * tokens.json is authored once and consumed by Tailwind on web and by a theme
 * object on native, so the two platforms cannot drift.
 */
import raw from './tokens.json' with { type: 'json' };

/** Strip the $-prefixed documentation keys that live alongside real values. */
const strip = <T extends Record<string, unknown>>(o: T): Record<string, never> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$'))) as Record<string, never>;

export const tokens = raw;

/**
 * Primitive palettes. These are VALUES, not roles — a component never names one.
 * `theme.ts` assembles them into the roles the interface actually speaks in, and
 * the Tailwind preset exposes only those roles, so `bg-noir` cannot be written.
 */
export const color = raw.color;
export const colorLight = raw.colorLight;
export const noteTier = raw.noteTier;
export const noteTierLight = raw.noteTierLight;
export const scentFamily = raw.scentFamily;
/** One theme's faces: Arabic and English headings and text, and the Latin label face. */
export interface ThemeFonts { displayAr: string; bodyAr: string; displayEn: string; bodyEn: string; label: string }
/** One set of faces for both themes; they follow the language only. See tokens.json `font.$usage`. */
export const font = strip(raw.font) as unknown as ThemeFonts;
export const fontSize = strip(raw.fontSize) as unknown as Record<string, number>;
export const lineHeight = strip(raw.lineHeight) as unknown as Record<string, number>;
export const letterSpacing = raw.letterSpacing;
export const space = raw.space;
export const radius = raw.radius;
export const motion = strip(raw.motion) as unknown as Record<string, number>;
export const easing = strip(raw.easing) as unknown as Record<string, string>;
export const opacity = raw.opacity;
export const haptic = strip(raw.haptic) as unknown as Record<string, string>;

/** 44pt is the hard floor for anything tappable. The visual may be smaller. */
export const TOUCH_TARGET = raw.size.touchTarget;
export const TAB_BAR = raw.size.tabBar;
export const CONTROL = raw.size.control;

/**
 * Page widths. The phone column is capped so a 6.7-inch handset does not stretch
 * a 2-up grid into something unreadable; the content column is capped because a
 * 1240px measure is already generous and 1900px of text is not luxury, it is a
 * spreadsheet.
 */
export const layout = {
  phoneMax: raw.size.phoneMax,
  contentMax: raw.size.contentMax,
  proseMax: raw.size.proseMax,
};

/** Smallest permitted READING size. 9.5 and 10.5 are for letterspaced labels only. */
export const MIN_READING_SIZE = 11;

export * from './glass';
export * from './theme';

export type ColorName = keyof typeof raw.color;
export type SpaceStep = keyof typeof raw.space;
export type MotionSpeed = keyof typeof motion;
