import { describe, expect, it } from 'vitest';
import { inkMask } from './ink-mask';

/**
 * The ink arrives from the reading edge: from the right in Arabic, from the
 * left in English (CLAUDE.md §14 — progress runs from the reading start;
 * asserted here, not eyeballed). The stylesheet slides an RTL mask from 0% to
 * 100% — which shows its RIGHT end last of all and its written half first from
 * the right — and an LTR mask the other way.
 */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const column = (mask: ReturnType<typeof inkMask>, x: number) =>
  Array.from({ length: mask.height }, (_, y) => mask.alpha[y * mask.width + x]!);

describe('a heading is written from where it is read', () => {
  it('in Arabic, the ink is on the right of the front and the paper clear on the left', () => {
    const mask = inkMask(400, 60, 'rtl', 0.5, seeded(7));
    expect(column(mask, mask.width - 1).every((a) => a === 255)).toBe(true);
    expect(column(mask, 0).every((a) => a === 0)).toBe(true);
  });

  it('in English, the same mask the other way round', () => {
    const mask = inkMask(400, 60, 'ltr', 0.5, seeded(7));
    expect(column(mask, 0).every((a) => a === 255)).toBe(true);
    expect(column(mask, mask.width - 1).every((a) => a === 0)).toBe(true);
  });

  it('is three headings wide, so sliding it carries the front across the words', () => {
    const mask = inkMask(400, 60, 'rtl', 0.5, seeded(3));
    expect(mask.width).toBe(600);
    expect(mask.height).toBe(30);
    // The front wanders around the middle, never near either end.
    const middle = column(mask, mask.width / 2);
    expect(middle.some((a) => a > 0 && a < 255)).toBe(true);
  });

  it('runs its blots ahead of the ink, into the paper not yet written', () => {
    const rtl = inkMask(400, 60, 'rtl', 0.5, seeded(11));
    const ltr = inkMask(400, 60, 'ltr', 0.5, seeded(11));
    // Ahead of an RTL front is the clear LEFT half; of an LTR front, the right.
    expect(rtl.blots.every((b) => b.x < rtl.width / 2 + 25)).toBe(true);
    expect(ltr.blots.every((b) => b.x > ltr.width / 2 - 25)).toBe(true);
  });

  it('is not the same twice', () => {
    const a = inkMask(400, 60, 'rtl', 0.5, seeded(1));
    const b = inkMask(400, 60, 'rtl', 0.5, seeded(2));
    expect(a.alpha).not.toEqual(b.alpha);
  });
});
