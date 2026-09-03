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

export function isSessionValid(session: SellerSession, now: number): boolean {
  return now - session.issuedAt < SELLER_SESSION_TTL_MS && now >= session.issuedAt;
}

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
