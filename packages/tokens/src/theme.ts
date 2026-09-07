/**
 * Semantic roles — the layer that makes two themes possible.
 *
 * WHY THIS EXISTS. Until now a component said `bg-noir` and `text-bone`, which
 * names a VALUE, not a job. That is fine while there is one palette and fatal
 * the moment there are two: `bg-noir` cannot mean "the page ground" on paper
 * without the name becoming a lie, and a codebase whose colour names lie is one
 * where nobody can predict what a change does.
 *
 * So components name the ROLE — ground, raised, line, ink, ink2, ink3, accent —
 * and this file decides what each role is worth in each theme. Adding a third
 * theme is one entry here and no component edits. That is the whole design.
 *
 * DESIGN_DOCTRINE law IV still holds: one accent, used sparingly. Light mode
 * does not add a colour, it restates the same three — ground, ink, accent — in
 * the other direction.
 *
 * The roles deliberately mirror the HIG's own advice: dynamic colours are
 * "semantically defined by purpose, rather than appearance or colour values",
 * and an app that redefines their meaning per screen loses the guarantee.
 *
 * WHAT DOES NOT FLIP. The flacon plate keeps its dark stage in both themes.
 * A perfume is photographed in a dark room whichever way the page is lit, and
 * `scentFamily` / `glassPalette` are the physics of that room — they describe
 * light through glass, not chrome. Inverting them would produce a bottle lit
 * from a lightbox, which is a catalogue photograph, not a shop window.
 */
import raw from './tokens.json' with { type: 'json' };

const dark = raw.color;
const light = raw.colorLight;

/** Every semantic role, in the order a screen is built: surfaces, then ink. */
export interface ThemeRoles {
  /** The page. Everything else sits on it. */
  ground: string;
  /**
   * The stage a product is photographed on. Dark in BOTH themes, deliberately.
   * See the note above: the flacon is lit in a dark room whichever way the page
   * is lit, and a bottle on white is a catalogue cut-out, not a shop window.
   */
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
  /** Brass, as TEXT and hairlines. Darkens on paper; see the note below. */
  accent: string;
  /** Brass as a FILL. Does not darken — the gold slab is the same gold. */
  accentSurface: string;
  /** Ink printed on `accentSurface`. Dark in both themes. */
  onAccent: string;
  /** Errors and refusals. */
  danger: string;
  /** Pyramid tiers. Data visualisation only — never chrome. */
  noteTop: string;
  noteHeart: string;
  noteBase: string;
}

/**
 * The accent is the one role whose value is NOT shared between themes, and the
 * reason is arithmetic rather than taste: brass at #B08D57 gives 6.4:1 on noir
 * and 2.4:1 on paper. A single accent value cannot serve both, so on paper the
 * TEXT accent drops to #80612E (4.95:1) while the FILLED accent — the primary
 * button, the bag badge — stays the original brass, because there the ink on
 * top of it is dark and the pair is measured the other way round (6.4:1).
 *
 * One accent, two jobs, measured separately. Not two accents.
 */
export const themes: { readonly dark: ThemeRoles; readonly light: ThemeRoles } = {
  dark: {
    ground: dark.noir,
    plate: dark.noir,
    raised: dark.l1,
    raised2: dark.l2,
    raised3: dark.l3,
    sunken: dark.noir,
    line: dark.hair,
    ink: dark.bone,
    ink2: dark.dim,
    ink3: dark.faint,
    accent: dark.brass,
    accentSurface: dark.brass,
    onAccent: dark.noir,
    danger: dark.danger,
    noteTop: raw.noteTier.top,
    noteHeart: raw.noteTier.heart,
    noteBase: raw.noteTier.base,
  },
  light: {
    ground: light.paper,
    plate: dark.noir,
    raised: light.paperL1,
    raised2: light.paperL2,
    raised3: light.paperL3,
    // A field reads as a well cut into paper, so it goes to pure white — the
    // one place the light theme is allowed to be colourless.
    sunken: light.paperL3,
    line: light.rule,
    ink: light.graphite,
    ink2: light.slate,
    ink3: light.stone,
    accent: light.bronze,
    accentSurface: dark.brass,
    onAccent: dark.noir,
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
 * Dark is the default, and that is a brand decision rather than an oversight.
 *
 * The HIG would have the app follow the system appearance. For an OS-resident
 * app that is right. This is a storefront: a visitor whose laptop is in light
 * mode would otherwise meet a DIFFERENT house than the one on the poster, and
 * noir is not a theme here, it is the identity. So the system preference is not
 * read; the choice is offered, explicitly, and remembered.
 *
 * Flipping to system-following is one constant — this one — and nothing else.
 */
export const DEFAULT_THEME: ThemeName = 'dark';

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
 * A perfume is lit in a dark room in both themes, so the hero stage and the
 * product plate stay black on paper. The first version scoped the variables to
 * `:root`, which meant the ink INSIDE those dark panels went graphite along
 * with the rest of the page — near-black type on a near-black stage. Fixing it
 * per element would have meant a second colour decision at every one of them.
 *
 * Declaring the themes on ANY element instead makes `data-theme="dark"` a
 * scope: everything inside a marked panel resolves against the dark theme —
 * ink, hairlines, the accent — with no component knowing why. One attribute,
 * and the panel is simply somewhere else.
 */
export const themeBaseStyles: Record<string, Record<string, string>> = {
  ':root': declarations('dark'),
  [`[${THEME_ATTRIBUTE}='light']`]: declarations('light'),
  [`[${THEME_ATTRIBUTE}='dark']`]: declarations('dark'),
};

/**
 * The Tailwind colour map: every role, as a channel-backed function.
 *
 * Only roles appear here. The primitives — `noir`, `bone`, `paper`, `bronze` —
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
