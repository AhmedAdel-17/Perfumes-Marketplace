/**
 * Tailwind preset generated from tokens.json.
 *
 * Apps extend this rather than declaring colours of their own, so a value that
 * is not in the token file cannot be reached through a utility class.
 */
import { fontSize, layout, letterSpacing, lineHeight, motion, opacity, radius, scentFamily, space, font } from './index';
import { themeColors } from './theme';

const px = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]));

const ms = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}ms`]));

export const diyarPreset = {
  theme: {
    extend: {
      /*
        ROLES ONLY.

        `themeColors` maps ground/raised/line/ink/accent to channel-backed CSS
        variables, so `bg-ground` means "the page" in both themes and there is
        no `bg-noir` to reach for. The primitives are absent on purpose: a
        component that could name one would pin itself to a single theme, and
        it would do so silently — the class compiles, the page renders, and the
        defect is invisible until somebody switches the toggle.

        `family` is the exception and stays a literal palette. It paints light
        through glass on a plate that is dark in BOTH themes, so it is physics,
        not chrome. See the note in theme.ts.
      */
      colors: { ...themeColors, family: scentFamily },
      /*
        Real fallback stacks, not a bare generic.

        The webfonts load with `display: swap`, so on a slow connection every
        visitor reads the page in the FALLBACK first — and `sans-serif` alone
        resolves to Times on some Android builds, which renders Arabic badly
        enough to look broken. Naming the system Arabic faces means the swap
        period looks like a different typeface rather than like a failure.

        Segoe UI is Windows, Geeza Pro and SF Arabic are Apple, Noto Naskh
        Arabic ships on Android and most Linux desktops.
      */
      fontFamily: {
        display: [font.display, 'Amiri Quran', '"Noto Naskh Arabic"', 'serif'],
        latin: [font.displayLatin, 'Georgia', '"Times New Roman"', 'serif'],
        sans: [
          font.body,
          '"Segoe UI"', '"SF Arabic"', '"Geeza Pro"', '"Noto Naskh Arabic"',
          'system-ui', 'sans-serif',
        ],
      },
      fontSize: px(fontSize),
      lineHeight: lineHeight as unknown as Record<string, string>,
      letterSpacing: px(letterSpacing),
      spacing: { ...px(space), touch: '44px', tab: '49px', control: '52px' },
      // Layout widths come from tokens too, so 'how wide is a page' is one
      // decision made once rather than a number retyped in every route.
      maxWidth: px(layout),
      // And as a floor. A wide table must not be squeezed below a readable
      // measure, and without this the only way to say so was a hand-typed
      // `min-w-[…px]` — a layout width retyped per screen after all.
      minWidth: px(layout),
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
