/**
 * Tailwind preset generated from tokens.json.
 *
 * Apps extend this rather than declaring colours of their own, so a value that
 * is not in the token file cannot be reached through a utility class.
 */
import { fontSize, layout, letterSpacing, lineHeight, motion, opacity, radius, scentFamily, space } from './index';
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

        `family` is the exception and stays a literal palette: it is the
        colour of the liquid in the illustrated flacon, a drawing of a thing,
        not chrome, and a perfume does not change colour with the theme.

        `stage` — the lit near-black room behind the first identity's bottles —
        was removed with identity v2's Phase D (16 Oct 2026). Photographs and
        the illustrated fallback both sit on the theme's `plate` now.
      */
      colors: { ...themeColors, family: scentFamily },
      /*
        Fonts are VARIABLES, set per theme and per language in apps/web
        globals.css (identity v2, 14 Oct 2026): Laboratoire and Noir use
        different faces, and English uses different faces from Arabic. A
        component says `font-display` — "the heading face" — and never names a
        family, exactly as it says `text-ink` and never names a hex.

          display  headings
          sans     everything else
          latin    Latin labels and data: sizes, references, specimen fields
                   (never Arabic — tracking breaks the joins)

        Each variable carries its own fallback stack, so the swap period on a
        slow connection looks like a different typeface rather than a failure.
      */
      fontFamily: {
        display: ['var(--f-display)'],
        sans: ['var(--f-body)'],
        latin: ['var(--f-label)'],
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
