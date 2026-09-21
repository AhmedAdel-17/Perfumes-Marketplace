import type { ExternalProvider } from './ports';

/**
 * Seller sign-in.
 *
 * Sellers sign in with a phone and a one-time code, which needs an SMS provider
 * we do not have a contract with yet. Rather than block the entire seller
 * portal on that contract, sign-in sits behind a port and this is the
 * development adapter.
 *
 * It declares `isStub: true`, which means `assertProductionSafe` refuses to
 * boot a production process holding it. That declaration is the only thing
 * between a convenient shortcut and "anyone can become any seller", so it is
 * not conditional on an environment variable or a build flag — the environment
 * is exactly what gets misconfigured.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not accept a fixed code, and it
 * does not skip verification. The real flow — request a code, receive it,
 * enter it, get it wrong and be refused — runs identically in development,
 * because the first time a rejection path executes must not be in front of a
 * seller whose orders are timing out.
 */
export interface SellerSession {
  readonly sellerId: string;
  readonly staffAuthUserId: string;
  readonly issuedAt: number;
}

export interface SellerIdentityProvider extends ExternalProvider {
  /**
   * Resolve a phone to the house it belongs to.
   *
   * Returns null for an unknown number, and the caller must give the SAME
   * answer for "no such house" as for "wrong code" — telling an attacker which
   * phone numbers belong to sellers is a list worth having.
   */
  resolve(phone: string): Promise<{ sellerId: string; staffAuthUserId: string } | null>;
}

/** How long a seller stays signed in before the code is asked for again. */
export const SELLER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How long an OPERATOR stays signed in. Shorter than a house's, deliberately:
 * an operator can release money and a house can only work its own queue, and a
 * session length is a statement about what an unattended browser is worth.
 *
 * Both lengths live here, beside each other, so the difference is visible in
 * one place rather than discovered in two session modules.
 *
 * `isSessionValid` USED TO LIVE HERE and was deleted with task P3.4.2. It
 * decided expiry from a timestamp inside the cookie, by the application
 * server's clock. Sessions are rows now (migration 0028), and the database
 * decides expiry with `now()` — the clock that stamped them — so the function
 * had no remaining caller, and a second expiry rule that nothing uses is a rule
 * somebody will eventually trust by mistake.
 */
export const OPS_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * A six-digit code.
 *
 * Uniform over the range — `Math.floor(random() * 900000) + 100000` is the
 * usual one-liner and it silently excludes every code starting with a zero,
 * throwing away a tenth of the space for the sake of a fixed width that
 * `padStart` gives for free.
 */
export function generateOtpCode(random: (max: number) => number): string {
  return String(random(1_000_000)).padStart(6, '0');
}

/* ------------------------------------------------------ where codes are kept */

/**
 * Which portal a code opens.
 *
 * A house's code must not open the operator console. The audience is part of
 * the row and part of the lookup, so a code issued for one cannot be presented
 * to the other — it is not that the two flows happen to use different tables,
 * it is that the same table refuses the swap.
 */
export type CodeAudience = 'seller' | 'platform';

export type CodeVerdict = 'ok' | 'wrong' | 'expired' | 'too_many_attempts';

/**
 * How long a code is worth. Five minutes: long enough to arrive over a slow
 * Egyptian network and read off a lock screen, short enough that a code seen
 * over somebody's shoulder is worthless by the time it is typed.
 */
export const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * How many guesses. Six digits is a million possibilities; five attempts makes
 * brute force hopeless while leaving room for somebody mistyping on a phone.
 */
export const CODE_MAX_ATTEMPTS = 5;

/**
 * Port: where pending one-time codes live.
 *
 * NOT an `ExternalProvider`, deliberately. That interface exists for things
 * another company owns — the SMS sender, Paymob, Bosta — where a fake reaching
 * production is a hole, and `assertProductionSafe` refuses to boot holding one.
 * A code store is ours: the Postgres implementation IS the real thing, with no
 * contract to wait for. Declaring the in-memory one a stub would make production
 * refuse to start over a component that has a perfectly real implementation, and
 * would blur what `isStub` means for the providers where it is load-bearing.
 *
 * The SMS SENDER remains the stub, and remains what blocks sign-in going live.
 * That is DEBT_REGISTER #1's actual condition: the store and the sender must be
 * replaced together. This pays the store half, so the day a contract is signed
 * only the sender is swapped.
 */
export interface LoginCodeStore {
  /**
   * Record a code for this number, replacing any pending one.
   *
   * Takes the code and stores only a digest of it — see `hashLoginCode`. The
   * caller keeps the plaintext exactly long enough to hand it to the sender.
   *
   * NO EXPIRY ARGUMENT, deliberately. The store decides when the code dies,
   * from `CODE_TTL_MS` and its own clock — the database's, for the real one. A
   * caller passing an absolute moment would be trusting whichever container's
   * clock answered, and the failure mode of a skewed clock is a code accepted
   * long after it should have died, silently and only on one machine.
   */
  issue(input: {
    readonly phone: string;
    readonly audience: CodeAudience;
    readonly code: string;
  }): Promise<void>;

  /**
   * Check a submitted code and consume it.
   *
   * One call, not read-then-write: two simultaneous guesses that each read the
   * same attempt count would each write it back incremented by one, and the
   * ceiling becomes a suggestion at precisely the moment it matters.
   */
  verify(input: {
    readonly phone: string;
    readonly audience: CodeAudience;
    readonly code: string;
  }): Promise<CodeVerdict>;
}

/**
 * The digest that is stored instead of the code.
 *
 * SHA-256 over the phone and the code TOGETHER. The phone is in the digest
 * because there are only a million six-digit codes: without it, every row
 * holding `042513` would have an identical digest, and one precomputed table of
 * a million hashes would reverse the entire table at once. With it, an attacker
 * needs that table per phone number, and the row is worthless five minutes
 * later anyway.
 *
 * Not bcrypt or argon2, and that is a decision rather than an oversight. Those
 * exist to make GUESSING expensive for secrets that live for years; this secret
 * lives for five minutes, is drawn uniformly from a million values, and is
 * already protected against guessing by a five-attempt ceiling enforced in the
 * database. What the digest defends against here is a DUMP — somebody reading a
 * backup — and a fast hash with the phone mixed in does that. A slow KDF on the
 * sign-in path would also hand anyone a way to make the server work hard by
 * typing wrong codes.
 */
export function hashLoginCode(
  phone: string,
  code: string,
  sha256: (input: string) => string,
): string {
  return sha256(`${phone}:${code}`);
}
