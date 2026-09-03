import { describe, expect, it } from 'vitest';
import {
  counted,
  DAY,
  HOUSE,
  ORDER,
  PERFUME,
  plural,
  pluralCategory,
  REVIEW,
  type PluralCategory,
  type PluralForms,
} from './plural';

/** Western digits keep these assertions readable; the rule is tested elsewhere. */
const digits = (n: number) => String(n);

describe('pluralCategory — the CLDR rule for ar', () => {
  it('separates zero, one and two from the ranges', () => {
    expect(pluralCategory(0)).toBe('zero');
    expect(pluralCategory(1)).toBe('one');
    expect(pluralCategory(2)).toBe('two');
  });

  it('treats 3 through 10 as few', () => {
    for (let n = 3; n <= 10; n += 1) {
      expect(pluralCategory(n), String(n)).toBe('few');
    }
  });

  it('treats 11 through 99 as many', () => {
    for (const n of [11, 12, 25, 50, 98, 99]) {
      expect(pluralCategory(n), String(n)).toBe('many');
    }
  });

  it('is driven by n MOD 100, not by n', () => {
    // The rule everyone hand-rolling this gets wrong: 103 behaves like 3 and
    // 111 behaves like 11, because only the last two digits decide.
    expect(pluralCategory(103)).toBe('few');
    expect(pluralCategory(110)).toBe('few');
    expect(pluralCategory(111)).toBe('many');
    expect(pluralCategory(199)).toBe('many');
    expect(pluralCategory(1005)).toBe('few');
  });

  it('sends exact hundreds and 101/102 to other', () => {
    expect(pluralCategory(100)).toBe('other');
    expect(pluralCategory(200)).toBe('other');
    expect(pluralCategory(1000)).toBe('other');
    expect(pluralCategory(101)).toBe('other');
    expect(pluralCategory(102)).toBe('other');
  });

  it('refuses inputs a count cannot be', () => {
    expect(() => pluralCategory(-1)).toThrow(RangeError);
    expect(() => pluralCategory(1.5)).toThrow(RangeError);
    expect(() => pluralCategory(Number.NaN)).toThrow(RangeError);
  });
});

describe('counted — the count and the noun together', () => {
  it('does not prefix a numeral to zero, one or two', () => {
    // "٢ عطران" reads as "two two-perfumes"; the count is inside the word.
    expect(counted(0, PERFUME, digits)).toBe('لا عطور');
    expect(counted(1, PERFUME, digits)).toBe('عطر');
    expect(counted(2, PERFUME, digits)).toBe('عطران');
  });

  it('prefixes the numeral from three upwards', () => {
    expect(counted(3, PERFUME, digits)).toBe('3 عطور');
    expect(counted(11, PERFUME, digits)).toBe('11 عطرًا');
    expect(counted(100, PERFUME, digits)).toBe('100 عطر');
  });

  it('is the fix for the bug that shipped: three is عطور, never عطر', () => {
    expect(counted(3, PERFUME, digits)).not.toContain('3 عطر ');
    expect(plural(3, PERFUME)).toBe('عطور');
  });

  it('uses whatever numeral system the caller injects', () => {
    const arabicIndic = (n: number) =>
      String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
    expect(counted(3, PERFUME, arabicIndic)).toBe('٣ عطور');
  });
});

describe('the counted nouns themselves', () => {
  const NOUNS: ReadonlyArray<readonly [string, PluralForms]> = [
    ['PERFUME', PERFUME], ['HOUSE', HOUSE], ['DAY', DAY],
    ['ORDER', ORDER], ['REVIEW', REVIEW],
  ];
  const CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

  it('declare all six forms, non-empty', () => {
    for (const [name, forms] of NOUNS) {
      for (const category of CATEGORIES) {
        expect(forms[category], `${name}.${category}`).toBeTruthy();
      }
    }
  });

  it('never embed a digit — the numeral is the caller\'s job', () => {
    for (const [name, forms] of NOUNS) {
      for (const category of CATEGORIES) {
        expect(forms[category], `${name}.${category}`).not.toMatch(/[0-9٠-٩]/);
      }
    }
  });

  it('distinguish singular from dual from plural', () => {
    for (const [name, forms] of NOUNS) {
      expect(forms.one, name).not.toBe(forms.two);
      expect(forms.one, name).not.toBe(forms.few);
      expect(forms.two, name).not.toBe(forms.few);
    }
  });
});
