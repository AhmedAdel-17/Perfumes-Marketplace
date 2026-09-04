import { describe, expect, it } from 'vitest';
import {
  generateOrderReference,
  normaliseOrderReference,
  REFERENCE_ALPHABET,
  REFERENCE_BODY_LENGTH,
} from './order-reference';
import { InvalidRandomness } from '../errors/index';

/** Deterministic bytes, so the alphabet can actually be asserted. */
const bytes = (...values: number[]): (length: number) => Uint8Array =>
  (length) => Uint8Array.from(Array.from({ length }, (_, i) => values[i % values.length]!));

describe('order references — read down a phone line', () => {
  it('has the shape DY-XXXXXXXX', () => {
    const reference = generateOrderReference(bytes(0));
    expect(reference).toMatch(/^DY-[A-Z0-9]{8}$/);
    expect(reference).toHaveLength(3 + REFERENCE_BODY_LENGTH);
  });

  it('drops BOTH members of every confusable pair', () => {
    // The first version of this alphabet kept 8 while excluding B — the comment
    // said one thing and the constant said another, and this assertion is what
    // found it. Keeping the digit and dropping the letter is the usual
    // shortcut; it fails the moment the code is handwritten rather than typed.
    const pairs: ReadonlyArray<readonly string[]> = [
      ['0', 'O'], ['1', 'I', 'L'], ['5', 'S'], ['8', 'B'],
      ['2', 'Z'], ['6', 'G'], ['7', 'T'],
    ];
    for (const pair of pairs) {
      for (const character of pair) {
        expect(REFERENCE_ALPHABET, `${character} (pair ${pair.join('/')})`)
          .not.toContain(character);
      }
    }
  });

  it('contains no vowels, so it cannot spell anything', () => {
    for (const vowel of ['A', 'E', 'I', 'O', 'U']) {
      expect(REFERENCE_ALPHABET, vowel).not.toContain(vowel);
    }
  });

  it('has no duplicate symbols, which would skew the modulo', () => {
    expect(new Set(REFERENCE_ALPHABET).size).toBe(REFERENCE_ALPHABET.length);
  });

  it('never emits a character outside its alphabet, for any byte', () => {
    // Every possible byte value, not a sample: the modulo has to land inside
    // the alphabet for all 256 of them or some orders are unreadable.
    for (let byte = 0; byte < 256; byte += 1) {
      const reference = generateOrderReference(bytes(byte));
      for (const character of reference.slice(3)) {
        expect(REFERENCE_ALPHABET, `byte ${byte}`).toContain(character);
      }
    }
  });

  it('refuses a generator that returns the wrong number of bytes', () => {
    // InvalidRandomness, not InvalidMoney. The generator threw the money error
    // for a short random-byte read, and a delivery layer mapping codes to
    // Arabic would have told the customer their payment amount was invalid.
    expect(() => generateOrderReference(() => new Uint8Array(3))).toThrow(InvalidRandomness);
  });

  it('is deterministic for the same bytes, which is what makes it testable', () => {
    expect(generateOrderReference(bytes(7, 9, 11))).toBe(generateOrderReference(bytes(7, 9, 11)));
  });
});

describe('normalising what the customer typed', () => {
  const valid = generateOrderReference(bytes(3, 14, 15, 92, 65, 35, 89, 79));

  it('accepts the reference exactly as printed', () => {
    expect(normaliseOrderReference(valid)).toBe(valid);
  });

  it('forgives case, spaces and a missing hyphen', () => {
    // Refusing "dy 1234abcd" when we know precisely what it means is hostility
    // dressed as validation.
    expect(normaliseOrderReference(valid.toLowerCase())).toBe(valid);
    expect(normaliseOrderReference(valid.replace('-', ''))).toBe(valid);
    expect(normaliseOrderReference(`  ${valid.toLowerCase()}  `)).toBe(valid);
  });

  it('rejects anything containing an excluded character', () => {
    // We know an O cannot be in a reference — but guessing that the customer
    // meant a zero would be inventing an order number.
    expect(normaliseOrderReference('DY-OOOOOOOO')).toBeNull();
    expect(normaliseOrderReference('DY-11111111')).toBeNull();
  });

  it('rejects the wrong prefix, the wrong length and empty input', () => {
    expect(normaliseOrderReference('XX-CDFGHJKM')).toBeNull();
    expect(normaliseOrderReference('DY-CDFG')).toBeNull();
    expect(normaliseOrderReference('DY-CDFGHJKMNP')).toBeNull();
    expect(normaliseOrderReference('')).toBeNull();
    expect(normaliseOrderReference('   ')).toBeNull();
  });
});
