/**
 * Order references.
 *
 * The customer reads this down a phone line to a courier, writes it into a
 * WhatsApp message, and quotes it to support. That makes the alphabet a
 * correctness concern rather than a cosmetic one:
 *
 *  - Every visually confusable PAIR loses both members, not one. The pairs are
 *    0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G and 7/T. Dropping only the letter and
 *    keeping the digit is the usual shortcut and it does not work for a code
 *    that is also handwritten — a customer who writes 2 and reads Z is a
 *    support ticket that begins "I gave you the number and you said it doesn't
 *    exist."
 *  - Vowels go too (A, E, U; I and O are already out), which is the cheap way
 *    to guarantee the generator cannot spell an unfortunate word in English or
 *    in Arabic transliteration.
 *  - Uppercase only, so case never has to be explained or preserved.
 *
 * That leaves 18 symbols. 18^8 is about 11 billion, which is not a security
 * property and is not meant to be — uniqueness is guaranteed by the unique
 * index, and this alphabet is chosen for the human at the other end.
 *
 * Randomness is INJECTED. A reference generator that reaches for
 * `Math.random()` is untestable and, worse, unverifiable — you cannot prove the
 * alphabet is respected if every run produces something different.
 */
import { InvalidRandomness } from '../errors/index';

/** 18 symbols, none of which can be misread as another. */
export const REFERENCE_ALPHABET = 'CDFHJKMNPQRVWXY349';

export const REFERENCE_PREFIX = 'DY';
export const REFERENCE_BODY_LENGTH = 8;

/** Bytes in, bytes out. `crypto.getRandomValues` satisfies this in both runtimes. */
export type RandomBytes = (length: number) => Uint8Array;

/**
 * `DY-XXXXXXXX`.
 *
 * The modulo bias across an 18-symbol alphabet over 256 values is real but
 * irrelevant here: this is an identifier, not a secret, and it is protected by a
 * unique index rather than by entropy. Reaching for rejection sampling would be
 * precision applied to the wrong problem.
 */
export function generateOrderReference(random: RandomBytes): string {
  const bytes = random(REFERENCE_BODY_LENGTH);
  if (bytes.length !== REFERENCE_BODY_LENGTH) {
    throw new InvalidRandomness(
      `Reference generator asked for ${REFERENCE_BODY_LENGTH} bytes and received ${bytes.length}`,
    );
  }

  let body = '';
  for (const byte of bytes) {
    body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return `${REFERENCE_PREFIX}-${body}`;
}

const PATTERN = new RegExp(
  `^${REFERENCE_PREFIX}-[${REFERENCE_ALPHABET}]{${REFERENCE_BODY_LENGTH}}$`,
);

/**
 * Used by order lookup, where the input is whatever the customer typed.
 *
 * Accepts lowercase and a missing hyphen and normalises them, because refusing
 * "dy1234abcd" when we know exactly what it means is hostility dressed as
 * validation. Anything containing an excluded character is still rejected — it
 * cannot be a real reference, so guessing which symbol was meant would be
 * inventing an order.
 */
/**
 * Arabic-Indic and extended Arabic-Indic digits, as Western.
 *
 * DELIBERATE DUPLICATION of `westernDigits` in @diyar/i18n. The domain has no
 * runtime dependencies and must not grow one on a presentation package to
 * reach three lines of character arithmetic — the dependency rule is worth
 * more than the duplication. `westernDigits.test.ts` in the API package, which
 * can see both, asserts the two agree on every digit so they cannot drift.
 *
 * It belongs in the domain because forgiving how a human typed a reference is
 * this function's whole job: the alphabet contains 3, 4 and 9, and a customer
 * reading one back over the phone will type them on the keyboard they have.
 */
const toWesternDigits = (input: string): string =>
  input.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= 0x06F0 ? 0x06F0 : 0x0660));
  });

export function normaliseOrderReference(input: string): string | null {
  const cleaned = toWesternDigits(input).trim().toUpperCase().replace(/[\s-]/g, '');
  if (!cleaned.startsWith(REFERENCE_PREFIX)) return null;
  const candidate = `${REFERENCE_PREFIX}-${cleaned.slice(REFERENCE_PREFIX.length)}`;
  return PATTERN.test(candidate) ? candidate : null;
}
