import { describe, expect, it } from 'vitest';
import { color, colorLight, fontSize, motion, MIN_READING_SIZE, TOUCH_TARGET, radius, opacity, noteTier, noteTierLight } from './index';
import { cssVariable, themeBaseStyles, themeColors, themes, type ThemeRoles } from './theme';
import { diyarPreset } from './tailwind-preset';
import { nativeTheme } from './native-theme';

/** Relative luminance per WCAG 2.1. */
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

const contrast = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

describe('accessibility floor — audited, not aspirational', () => {
  it('every ink colour clears 4.5:1 on noir', () => {
    for (const name of ['bone', 'dim', 'faint', 'brass'] as const) {
      expect(contrast(color[name], color.noir), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('faint sits just above the floor, and anything DARKER breaks it', () => {
    // On a dark ground, lighter greys have MORE contrast, so the floor is
    // approached from below: the next step darker than faint must fail.
    //
    // Measured against the LIGHTEST surface it may be printed on, not against
    // the page. Against noir it has margin to spare; against an l3 panel it is
    // at 4.58:1, and that is the number that decides the value.
    expect(contrast(color.faint, color.l3)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.faint, color.l3)).toBeLessThan(5.2);
    expect(contrast('#8B837A', color.l3)).toBeLessThan(4.5);
  });

  it('the touch target floor is 44pt', () => {
    expect(TOUCH_TARGET).toBe(44);
  });

  it('reading text never goes below 11pt', () => {
    for (const [name, size] of Object.entries(fontSize)) {
      if (['micro', 'caption'].includes(name)) continue;   // letterspaced labels only
      expect(size, name).toBeGreaterThanOrEqual(MIN_READING_SIZE);
    }
  });
});

describe('motion — luxury has weight', () => {
  it('nothing is faster than 120ms', () => {
    for (const [name, ms] of Object.entries(motion)) {
      expect(ms, name).toBeGreaterThanOrEqual(120);
    }
  });

  it('durations increase monotonically', () => {
    expect(motion.instant).toBeLessThan(motion.quick!);
    expect(motion.quick).toBeLessThan(motion.base!);
    expect(motion.base).toBeLessThan(motion.slow!);
  });
});

describe('sharp, not soft', () => {
  it('no radius exceeds 3px except the pill, which is for avatars and dots', () => {
    for (const [name, r] of Object.entries(radius)) {
      if (name === 'pill') continue;
      expect(r, name).toBeLessThanOrEqual(3);
    }
  });
});

describe('one source of truth — web and native cannot drift', () => {
  /*
    The preset used to be asserted to carry every PRIMITIVE, and that assertion
    became exactly wrong the day there were two themes: a component able to
    write `bg-noir` can pin itself to one palette, and it does so silently — the
    class compiles, the page renders, and nobody sees it until somebody switches
    the toggle on a screen they were not looking at.

    So the guarantee is inverted. The preset exposes ROLES and nothing else, and
    these two assertions are a pair: the first says every role is reachable, the
    second says no primitive is. Either one alone is satisfied by a mistake.
  */
  it('the Tailwind preset exposes every semantic role', () => {
    for (const role of Object.keys(themes.dark) as Array<keyof ThemeRoles>) {
      const utility = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(themeColors[utility], utility).toBe(`rgb(var(${cssVariable(role)}) / <alpha-value>)`);
      expect(diyarPreset.theme.extend.colors[utility as never], utility).toBe(themeColors[utility]);
    }
  });

  it('no primitive is reachable through a utility class', () => {
    const exposed = Object.keys(diyarPreset.theme.extend.colors);
    // `danger` is a primitive AND a role, legitimately: the job and the value
    // have the same name because the colour exists for exactly one job. Only
    // names that are NOT roles can be asserted absent.
    const roles = new Set(Object.keys(themes.dark));
    for (const name of [...Object.keys(color), ...Object.keys(colorLight)]) {
      if (roles.has(name)) continue;
      expect(exposed, `${name} must not be a utility`).not.toContain(name);
    }
  });

  it('the native theme carries the same colours as the preset', () => {
    expect(nativeTheme.color).toEqual(color);
  });

  it('the preset exposes durations in ms', () => {
    expect(diyarPreset.theme.extend.transitionDuration.base).toBe('420ms');
  });

  it('opacity tokens survive into both', () => {
    expect(nativeTheme.opacity.veil).toBe(opacity.veil);
    expect(diyarPreset.theme.extend.opacity.veil).toBe(String(opacity.veil));
  });

  it('native declares RTL as the default', () => {
    expect(nativeTheme.isRTL).toBe(true);
  });
});

describe('two themes, one contract', () => {
  it('declares exactly the same roles in both', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
  });

  /*
    Every ink role, on every surface it can be printed on, in BOTH themes.

    The old assertion checked four inks against ONE ground. The pyramid's base
    tier passed it at 4.68:1 on the page and failed at 4.43:1 on the l1 panel it
    is actually drawn on — a rule applied to the wrong surface, which is worse
    than no rule because it reads as coverage. Enumerating the pairs is the only
    version of this that cannot be right about the wrong thing.
  */
  const SURFACES = ['ground', 'raised', 'raised2', 'raised3', 'sunken'] as const;
  const INKS = ['ink', 'ink2', 'ink3', 'accent', 'danger', 'noteTop', 'noteHeart', 'noteBase'] as const;

  for (const [themeName, roles] of Object.entries(themes)) {
    for (const ink of INKS) {
      for (const surface of SURFACES) {
        it(`${themeName}: ${ink} on ${surface} clears 4.5:1`, () => {
          expect(contrast(roles[ink], roles[surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it(`${themeName}: ink printed on the accent surface clears 4.5:1`, () => {
      expect(contrast(roles.onAccent, roles.accentSurface)).toBeGreaterThanOrEqual(4.5);
    });
  }

  /*
    The floor is approached from OPPOSITE directions, and that asymmetry is the
    thing most likely to be got wrong by whoever adds a third theme.

    On noir, a grey with less contrast is DARKER. On paper it is LIGHTER. A
    reviewer carrying the dark-theme instinct across will lighten `ink3` to
    "soften" it and take it straight through the floor without changing a single
    value any other test names.
  */
  it('the smallest label sits just above the floor in both directions', () => {
    expect(contrast(themes.dark.ink3, themes.dark.ground)).toBeLessThan(6);
    expect(contrast('#7C746B', themes.dark.ground)).toBeLessThan(4.5);   // darker fails on noir

    expect(contrast(themes.light.ink3, themes.light.ground)).toBeLessThan(6);
    expect(contrast('#767068', themes.light.ground)).toBeLessThan(4.5);  // LIGHTER fails on paper
  });

  it('emits every role as RGB channels, for both themes', () => {
    const channels = /^\d{1,3} \d{1,3} \d{1,3}$/;
    const names = Object.keys(themes.dark) as Array<keyof ThemeRoles>;
    for (const [selector, declarations] of Object.entries(themeBaseStyles)) {
      expect(Object.keys(declarations).length, selector).toBe(names.length);
      for (const role of names) {
        // Channels, not hexes: `bg-ground/[.72]` composes an alpha onto the
        // variable, and a hex there would break every translucent surface in
        // the product without throwing anywhere.
        expect(declarations[cssVariable(role)], `${selector} ${role}`).toMatch(channels);
      }
    }
  });

  it('keeps the stage dark on paper — a bottle is lit in a dark room either way', () => {
    expect(themes.light.plate).toBe(themes.dark.plate);
  });
});

describe('note-tier colours are TEXT, and were never checked as text', () => {
  it('every tier clears 4.5:1 on the ground it is printed on', () => {
    // These label the pyramid — "TOP", "HEART", "BASE" — at 9.5px, which is far
    // below the large-text exemption, so they need the full ratio.
    //
    // `base` was #8A6838 at 3.88:1 and shipped that way, because the contrast
    // assertions covered `color.*` and stopped there. A palette split across
    // two objects had its rule applied to one of them. It then shipped a SECOND
    // time at #95764A, clearing the page ground at 4.68:1 and failing the panel
    // it is actually drawn on at 4.43:1 — the same mistake with a thinner
    // margin. The surface matrix above is what finally covers it.
    for (const [tier, value] of Object.entries(noteTier)) {
      expect(contrast(value, color.noir), `noteTier.${tier}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the three tiers distinguishable — by hue OR by lightness', () => {
    /*
      This assertion has been wrong twice, in opposite directions, and the pair
      of failures is the whole lesson.

        1. Luminance contrast alone. Failed on heart (rose) vs base (warm
           brown) at 1.06 — two colours nobody would confuse, rejected for
           being evenly lit. Contrast ratio answers "can this be read against
           that background", not "can these two be told apart".

        2. Hue angle alone. Failed on top (gold) vs base (brown) at 9.5° —
           two colours nobody confuses either, because one is markedly
           lighter than the other.

      Two colours are distinguishable if they differ meaningfully in EITHER
      dimension. Requiring both rejects perfectly good palettes; requiring
      neither accepts bad ones.

      And this is a refinement rather than the guarantee: the pyramid labels
      every tier in words — القمة, القلب, القاعدة — so colour is never the sole
      carrier, which is what makes the tiers legible to a colour-blind reader
      whatever this test says.
    */
    const hue = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as
        [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return ((h * 60) + 360) % 360;
    };

    const hueGap = (a: string, b: string) => {
      const raw = Math.abs(hue(a) - hue(b));
      return Math.min(raw, 360 - raw);
    };

    /*
      BOTH palettes, and the light one is why this loop is not written against
      `noteTier` alone any more.

      The light tiers were authored by darkening the dark ones, which is the
      obvious move and it silently collapsed top against base: two golds, six
      degrees apart, 1.26:1 — a pyramid whose opening and closing notes are the
      same colour. Nothing failed, because the assertion named one object.
      Anything true of a palette is true of every palette.
    */
    for (const [palette, tiers] of Object.entries({ dark: noteTier, light: noteTierLight })) {
      const entries = Object.entries(tiers);
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const [nameA, a] = entries[i]!;
          const [nameB, b] = entries[j]!;
          const separated = hueGap(a, b) > 15 || contrast(a, b) > 1.5;
          expect(
            separated,
            `${palette}: ${nameA} (${a}) and ${nameB} (${b}) differ by only ` +
              `${hueGap(a, b).toFixed(0)}° of hue and ${contrast(a, b).toFixed(2)}:1 of lightness`,
          ).toBe(true);
        }
      }
    }
  });
});
