/**
 * React Native theme, generated from the same tokens.json the web reads.
 *
 * NativeWind consumes the Tailwind preset for class names; this object exists
 * for the cases NativeWind cannot express — animation drivers, haptics, and
 * anything that needs a raw number rather than a class.
 */
import { color, easing, fontSize, haptic, letterSpacing, lineHeight, motion, noteTier, opacity, radius, scentFamily, space, TAB_BAR, TOUCH_TARGET, font } from './index';

export const nativeTheme = {
  color,
  noteTier,
  scentFamily,
  font: {
    display: font.display,
    latin: font.displayLatin,
    body: font.body,
  },
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
