/**
 * One-time codes: the rules, against the in-memory store.
 *
 * These cases are written so they can be run against EITHER implementation —
 * `loginCodeCases` is exported for that reason, and `login-codes.contract.test.ts`
 * runs the identical list against Postgres. A double and a table agreeing is the
 * only thing that makes either of them trustworthy: the September pass found a
 * fixture that had been fine for months precisely because it was broken, since
 * nothing ever exercised the path that would have failed.
 */
import { describe, expect, it } from 'vitest';
import { CODE_MAX_ATTEMPTS, CODE_TTL_MS, hashLoginCode, type LoginCodeStore } from './session';
import { asVerdict, inMemoryLoginCodes } from './login-codes';

const PHONE = '01001234567';
const OTHER = '01009998877';
const CODE = '042513';

export interface LoginCodeCase {
  readonly name: string;
  run(store: LoginCodeStore): Promise<void>;
}

/** Shared by both implementations. */
export const loginCodeCases: readonly LoginCodeCase[] = [
  {
    name: 'a code that was issued verifies once',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');
    },
  },

  {
    name: 'and never twice — a used code cannot be replayed from a screenshot',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('expired');
    },
  },

  {
    name: 'a wrong code is refused without consuming the right one',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: '000000' })).toBe('wrong');
      // Somebody mistyping once must not lock themselves out of a code that is
      // still perfectly valid.
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');
    },
  },

  {
    name: 'a house’s code is refused at the operator console',
    async run(store) {
      /*
       * THE ONE THAT MATTERS MOST. These are different authorities: an operator
       * can release money. If an audience mismatch fell through to a plain
       * comparison, a code texted to a house would open the console — and the
       * answer is 'expired' rather than a distinct refusal, so which console a
       * number belongs to is not observable by asking.
       */
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      expect(await store.verify({ phone: PHONE, audience: 'platform', code: CODE })).toBe('expired');
      // And the code is still there for the portal it was actually issued for.
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');
    },
  },

  {
    name: 'the attempt ceiling is counted before the comparison, and consumes the code',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

      for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) {
        expect(await store.verify({ phone: PHONE, audience: 'seller', code: '111111' })).toBe('wrong');
      }

      // The next guess is refused for being the sixth, not for being wrong —
      // and crucially the RIGHT code no longer works either, or a ceiling would
      // merely slow an attacker down rather than stop them.
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: '111111' }))
        .toBe('too_many_attempts');
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('expired');
    },
  },

  {
    name: 'a malformed guess still costs an attempt',
    async run(store) {
      // Counted before the comparison: otherwise the ceiling is bypassed by
      // sending nonsense that fails some earlier check.
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) {
        await store.verify({ phone: PHONE, audience: 'seller', code: '' });
      }
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE }))
        .toBe('too_many_attempts');
    },
  },

  {
    name: 'requesting again replaces the pending code and resets the attempts',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      await store.verify({ phone: PHONE, audience: 'seller', code: '111111' });

      await store.issue({ phone: PHONE, audience: 'seller', code: '778899' });

      // The old one is gone — two live codes for one number would double the
      // guessing surface and make the ceiling meaningless.
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('wrong');
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: '778899' })).toBe('ok');
    },
  },

  {
    name: 'a number with no pending code is refused exactly like an expired one',
    async run(store) {
      // The same answer for "no such account" as for "expired", so the absence
      // of an account is not observable by asking.
      expect(await store.verify({ phone: OTHER, audience: 'seller', code: CODE })).toBe('expired');
    },
  },

  {
    name: 'codes are held per number, not globally',
    async run(store) {
      await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
      await store.issue({ phone: OTHER, audience: 'seller', code: '778899' });

      expect(await store.verify({ phone: OTHER, audience: 'seller', code: CODE })).toBe('wrong');
      expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');
    },
  },
];

describe('one-time codes — the in-memory store', () => {
  for (const testCase of loginCodeCases) {
    it(testCase.name, async () => {
      await testCase.run(inMemoryLoginCodes());
    });
  }

  it('expires a code once its moment has passed', async () => {
    // Time is moved rather than waited on. A test that sleeps for five minutes
    // is a test that gets deleted.
    let clock = Date.parse('2026-09-16T09:00:00Z');
    const store = inMemoryLoginCodes(() => clock);

    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
    clock += CODE_TTL_MS - 1000;
    expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('ok');

    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });
    clock += CODE_TTL_MS;
    expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('expired');
  });
});

describe('the digest that is stored instead of the code', () => {
  it('mixes the phone in, so one rainbow table cannot reverse the whole table', () => {
    // Six digits is a million possibilities. Without the phone, every row
    // holding the same code would have an identical digest and one precomputed
    // table of a million hashes would open every account at once.
    const sha = (input: string) => `sha(${input})`;
    expect(hashLoginCode(PHONE, CODE, sha)).not.toBe(hashLoginCode(OTHER, CODE, sha));
    expect(hashLoginCode(PHONE, CODE, sha)).toBe(hashLoginCode(PHONE, CODE, sha));
  });
});

describe('an answer this build does not recognise', () => {
  it('throws rather than guessing what it meant', () => {
    /*
     * `app.verify_login_code` returns text. If a later migration renamed a
     * verdict or added one, treating the unknown answer as a failure would
     * refuse everybody with nothing saying why, and treating it as success
     * would be very much worse.
     */
    expect(() => asVerdict('ok')).not.toThrow();
    expect(() => asVerdict('definitely_fine')).toThrow(/does not recognise/);
    expect(() => asVerdict(undefined)).toThrow(/does not recognise/);
  });
});
