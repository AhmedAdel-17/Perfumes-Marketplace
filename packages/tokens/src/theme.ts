/**
 * Semantic roles — the layer that makes two themes possible.
 *
 * WHY THIS EXISTS. Components name a JOB — ground, raised, line, ink, ink2,
 * ink3, accent — never a value, and this file decides what each job is worth in
 * each theme. Adding a third theme is one entry here and no component edits.
 * The Tailwind preset exposes only roles, so `bg-noir` does not compile.
 *
 * VISUAL IDENTITY v2 (founder decision FD-1, 14 Oct 2026). The two themes are no
 * longer one palette lit two ways; they are two finishes of one layout:
 *
 *   LIGHT, the default — "Laboratoire": putty ground, paper cards, sepia ink and
 *   ONE accent, olive. Taken from design-reference/redesign/04-laboratoire.html.
 *
 *   DARK — "Noir": black, bone and greys, and NO colour accent at all. The
 *   accent role is bone, so emphasis comes from weight, scale and photography.
 *   Taken from design-reference/redesign/02-noir-absolu.html.
 *
 * Law IV ("one accent") still holds in each theme. Fonts follow the theme too;
 * they are CSS variables set in apps/web globals.css, because a font is not a
 * colour channel and does not belong in this map.
 *
 * WHAT CHANGED ABOUT THE PLATE. It used to be dark in both themes — a bottle
 * lit in a dark room whichever way the page was lit. Identity v2 shows real
 * photographs on the page's own paper in light mode, so `plate` now follows the
 * theme. The dark `stage` palette survives only behind the ILLUSTRATED flacon,
 * the placeholder for a listing with no photograph.
 */
import raw from './tokens.json' with { type: 'json' };

const dark = raw.color;
const light = raw.colorLight;

/** Every semantic role, in the order a screen is built: surfaces, then ink. */
export interface ThemeRoles {
  /** The page. Everything else sits on it. */
  ground: string;
  /** The ground a product photograph sits on while it loads and around its edges. */
  plate: string;
  /** A panel lifted off the ground. Depth is value, never shadow. */
  raised: string;
  /** A panel on a panel. */
  raised2: string;
  /** The highest step. Rare — three levels of nesting is usually a layout fault. */
  raised3: string;
  /** An inset plane: text fields, wells. */
  sunken: string;
  /** The hairline. The only separator in the system. */
  line: string;
  /** Primary reading text and headings. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Smallest labels. Sits ON the 4.5:1 floor in both themes, by construction. */
  ink3: string;
  /** The one accent, as TEXT and hairlines: olive on light, bone on Noir. */
  accent: string;
  /** The accent as a FILL. */
  accentSurface: string;
  /** Ink printed on `accentSurface`. */
  onAccent: string;
  /** Errors and refusals. */
  danger: string;
  /** Pyramid tiers. Data visualisation only — never chrome. */
  noteTop: string;
  noteHeart: string;
  noteBase: string;
}

export const themes: { readonly dark: ThemeRoles; readonly light: ThemeRoles } = {
  dark: {
    ground: dark.noir,
    plate: dark.l1,
    raised: dark.l1,
    raised2: dark.l2,
    raised3: dark.l3,
    sunken: dark.noir,
    line: dark.hair,
    ink: dark.bone,
    ink2: dark.dim,
    ink3: dark.faint,
    // Noir has no colour accent. The role is bone, the same as the ink, so a
    // focus ring, an active tab or a link underline is white on black — and
    // nothing on the page competes with the photograph.
    accent: dark.bone,
    accentSurface: dark.chalk,
    onAccent: dark.noir,
    danger: dark.danger,
    noteTop: raw.noteTier.top,
    noteHeart: raw.noteTier.heart,
    noteBase: raw.noteTier.base,
  },
  light: {
    ground: light.putty,
    plate: light.plate,
    raised: light.paper,
    raised2: light.paperL2,
    raised3: light.paperL3,
    // A field reads as a well cut into paper: the near-white `well`, a step
    // lighter than the card it sits in.
    sunken: light.well,
    line: light.rule,
    ink: light.sepia,
    ink2: light.umber,
    ink3: light.stone,
    accent: light.olive,
    accentSurface: light.olive,
    onAccent: light.paper,
    danger: light.crimson,
    noteTop: raw.noteTierLight.top,
    noteHeart: raw.noteTierLight.heart,
    noteBase: raw.noteTierLight.base,
  },
};

export type ThemeName = keyof typeof themes;

/** The attribute the document carries, and the storage key that remembers it. */
export const THEME_ATTRIBUTE = 'data-theme';
export const THEME_STORAGE_KEY = 'diyar-theme';

/**
 * Light — "Laboratoire" — is the default (founder decision FD-1, 14 Oct 2026).
 * It was Noir until then.
 *
 * The system preference is deliberately not read: a storefront should open as
 * the same house for everyone, and the visitor's choice is offered explicitly
 * and remembered. Flipping to system-following is this one constant.
 *
 * The server renders the DEFAULT, so `:root` below carries the light roles and
 * a document with no `data-theme` attribute is Laboratoire.
 */
export const DEFAULT_THEME: ThemeName = 'light';

/** `#RRGGBB` → `R G B`, the space-separated form a CSS colour channel takes. */
const channels = (hex: string): string => {
  const h = hex.replace('#', '');
  if (h.length !== 6) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)).join(' ');
};

/** `ground` → `--c-ground`. One place decides the spelling. */
export const cssVariable = (role: keyof ThemeRoles): string =>
  `--c-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const declarations = (name: ThemeName): Record<string, string> =>
  Object.fromEntries(
    Object.entries(themes[name]).map(([role, hex]) => [
      cssVariable(role as keyof ThemeRoles),
      channels(hex),
    ]),
  );

/**
 * Base styles for Tailwind's `addBase`, applied from `apps/web/tailwind.config`.
 *
 * The variables hold CHANNELS rather than colours (`11 10 9`, not `#0B0A09`) so
 * a utility can write `rgb(var(--c-ground) / 0.72)` and the existing
 * `bg-ground/[.72]` opacity syntax keeps working. Storing a hex here would have
 * silently broken every translucent surface in the product — the header, the
 * scrims, the disabled states — and none of them would have thrown.
 *
 * THE ATTRIBUTE IS NOT ROOT-ONLY, and that turned out to be the whole trick.
 *
 * A panel that must stay dark inside a light page — the illustrated flacon's
 * stage is the one left — needs its ink, hairlines and accent to resolve dark
 * too. Variables scoped to `:root` only would leave near-black type on a
 * near-black stage, and fixing that per element would mean a second colour
 * decision at every one of them.
 *
 * Declaring the themes on ANY element instead makes `data-theme="dark"` a
 * scope: everything inside a marked panel resolves against the dark theme —
 * ink, hairlines, the accent — with no component knowing why. One attribute,
 * and the panel is simply somewhere else.
 */
export const themeBaseStyles: Record<string, Record<string, string>> = {
  ':root': declarations(DEFAULT_THEME),
  [`[${THEME_ATTRIBUTE}='light']`]: declarations('light'),
  [`[${THEME_ATTRIBUTE}='dark']`]: declarations('dark'),
};

/**
 * The Tailwind colour map: every role, as a channel-backed function.
 *
 * Only roles appear here. The primitives — `noir`, `bone`, `putty`, `olive` —
 * are deliberately NOT reachable through a utility class, so `bg-noir` no
 * longer compiles and a component physically cannot pin itself to one theme.
 * That is the guard; the naming convention alone would not have held.
 */
export const themeColors: Record<string, string> = Object.fromEntries(
  (Object.keys(themes.dark) as Array<keyof ThemeRoles>).map((role) => [
    // `noteTop` → `note-top`, so the class reads `text-note-top`.
    role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
    `rgb(var(${cssVariable(role)}) / <alpha-value>)`,
  ]),
);
