/**
 * React Native theme, generated from the same tokens.json the web reads.
 *
 * NativeWind consumes the Tailwind preset for class names; this object exists
 * for the cases NativeWind cannot express — animation drivers, haptics, and
 * anything that needs a raw number rather than a class.
 */
import { color, easing, fontSize, haptic, letterSpacing, lineHeight, motion, noteTier, opacity, radius, scentFamily, space, TAB_BAR, TOUCH_TARGET, font } from './index';
import { themes } from './theme';

export const nativeTheme = {
  color,
  noteTier,
  scentFamily,
  /*
    The semantic roles, both themes, so the apps resolve a colour by JOB exactly
    as the web does. A native app that read `color.graphite` for its background
    would be a second decision about what "the page" is, made in another
    language, and the two would drift the first time either palette moved.
  */
  themes,
  /* One set for both appearances: the themes differ in colour only (FD-1, amended 16 Oct 2026). */
  font,
  fontSize,
  lineHeight,
  letterSpacing,
  space,
  radius,
  motion,
  easing,
  opacity,
  haptic,
  layout: {
    touchTarget: TOUCH_TARGET,
    tabBar: TAB_BAR,
  },
  /** RTL is the default. I18nManager.forceRTL must be set at first launch. */
  isRTL: true,
} as const;

export type NativeTheme = typeof nativeTheme;
export default nativeTheme;
