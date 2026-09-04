/**
 * The two digit normalisers must agree.
 *
 * There are deliberately two. `westernDigits` lives in @diyar/i18n, which owns
 * every decision about numerals; `toWesternDigits` is a private copy inside
 * @diyar/domain's order-reference service, because the domain has no runtime
 * dependencies and must not grow one on a presentation package to reach three
 * lines of character arithmetic.
 *
 * A duplication that nothing checks is a duplication that drifts — three
 * separate defects in this project have been a second copy of a list quietly
 * disagreeing with the first. The API package can see both, so it is where
 * they get held together.
 */
import { describe, expect, it } from 'vitest';
import { westernDigits } from '@diyar/i18n';
import { normaliseOrderReference } from '@diyar/domain';

/** Both sets a keyboard in this market can produce. */
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED = '۰۱۲۳۴۵۶۷۸۹';

describe('westernDigits', () => {
  it('converts every Arabic-Indic digit', () => {
    expect(westernDigits(ARABIC_INDIC)).toBe('0123456789');
  });

  it('converts every extended (Persian and Urdu) digit', () => {
    // Several Android Arabic keyboards emit this set rather than U+0660.
    // Handling only the first range fixes the fault for most people and
    // leaves it exactly as impassable for the rest.
    expect(westernDigits(EXTENDED)).toBe('0123456789');
  });

  it('leaves Western digits alone', () => {
    expect(westernDigits('01012345678')).toBe('01012345678');
  });

  it('leaves Arabic letters alone', () => {
    // Only the numerals move. A street name keeps its script.
    expect(westernDigits('شارع البهراء')).toBe('شارع البهراء');
  });

  it('converts digits embedded in text without touching the text', () => {
    expect(westernDigits('عمارة ٢١ شقة ٣')).toBe('عمارة 21 شقة 3');
  });

  it('handles a mixed string', () => {
    expect(westernDigits('٠١٠1234٥٦٧٨')).toBe('01012345678');
  });
});

describe('the domain keeps its own copy in step', () => {
  /**
   * Reached through `normaliseOrderReference`, which is the only thing that
   * uses it. If the domain's copy stopped converting some digit, a reference
   * containing that digit would stop resolving — so this compares the two
   * implementations one digit at a time rather than trusting either.
   */
  it.each([...ARABIC_INDIC, ...EXTENDED])('converts %s the way i18n does', (digit) => {
    const western = westernDigits(digit);
    // Only 3, 4 and 9 are in the reference alphabet, so they are the digits on
    // which the domain's private copy can actually be observed from outside.
    if (!'349'.includes(western)) return;
    expect(normaliseOrderReference(`DY-CDFHJK${digit}M`)).toBe(`DY-CDFHJK${western}M`);
  });

  it('resolves a reference typed entirely in Arabic-Indic digits', () => {
    const reference = 'DY-C3D4F9CD';
    const typed = reference
      .replace(/3/g, '٣').replace(/4/g, '٤').replace(/9/g, '٩');
    expect(typed).not.toBe(reference);
    expect(normaliseOrderReference(typed)).toBe(reference);
  });

  it('still refuses a reference that is wrong for other reasons', () => {
    // The conversion must not become a way to smuggle a bad reference through.
    expect(normaliseOrderReference('DY-٣٤')).toBeNull();
    expect(normaliseOrderReference('XX-٣٤٩٣٤٩٣٤')).toBeNull();
  });
});
