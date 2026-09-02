import { describe, expect, it } from 'vitest';
import { color, fontSize, motion, MIN_READING_SIZE, TOUCH_TARGET, radius, opacity } from './index';
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
    // On a dark ground, lighter greys have MORE contrast. So the floor is
    // approached from below: the next step darker than faint must fail 4.5:1.
    expect(contrast(color.faint, color.noir)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.faint, color.noir)).toBeLessThan(6);
    expect(contrast('#7C746B', color.noir)).toBeLessThan(4.5);
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
  it('the Tailwind preset carries every token colour', () => {
    for (const [name, hex] of Object.entries(color)) {
      expect(diyarPreset.theme.extend.colors[name as keyof typeof color]).toBe(hex);
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
