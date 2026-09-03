/**
 * Tailwind preset generated from tokens.json.
 *
 * Apps extend this rather than declaring colours of their own, so a value that
 * is not in the token file cannot be reached through a utility class.
 */
import { color, fontSize, layout, letterSpacing, lineHeight, motion, noteTier, opacity, radius, scentFamily, space, font } from './index';

const px = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]));

const ms = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}ms`]));

export const diyarPreset = {
  theme: {
    extend: {
      colors: { ...color, note: noteTier, family: scentFamily },
      fontFamily: {
        display: [font.display, 'serif'],
        latin: [font.displayLatin, 'serif'],
        sans: [font.body, 'sans-serif'],
      },
      fontSize: px(fontSize),
      lineHeight: lineHeight as unknown as Record<string, string>,
      letterSpacing: px(letterSpacing),
      spacing: { ...px(space), touch: '44px', tab: '49px', control: '52px' },
      // Layout widths come from tokens too, so 'how wide is a page' is one
      // decision made once rather than a number retyped in every route.
      maxWidth: px(layout),
      borderRadius: px(radius),
      opacity: Object.fromEntries(Object.entries(opacity).map(([k, v]) => [k, String(v)])),
      transitionDuration: ms(motion),
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
        entrance: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
} as const;

export default diyarPreset;
