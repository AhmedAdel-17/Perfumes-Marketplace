import { describe, expect, it } from 'vitest';
import { internalDate } from './numerals';

const ARABIC_INDIC = /[٠-٩۰-۹]/;

describe('a date on an operating tool', () => {
  const when = '2026-09-15T09:05:00Z';

  it('uses Western digits — a console date is data', () => {
    const text = internalDate(when);
    expect(text).not.toMatch(ARABIC_INDIC);
    expect(text).toContain('2026');
  });

  it('keeps the month as an Arabic word, not a number', () => {
    expect(internalDate(when)).toMatch(/سبتمبر/);
  });

  it('adds the time only when asked, still in Western digits', () => {
    expect(internalDate(when)).not.toMatch(/:/);
    const withTime = internalDate(when, { time: true });
    expect(withTime).toMatch(/\d{1,2}:\d{2}/);
    expect(withTime).not.toMatch(ARABIC_INDIC);
  });
});
