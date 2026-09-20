import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { isSessionValid, type SellerSession } from '@diyar/api';

/**
 * The seller's signed-in state.
 *
 * A signed cookie, not a session table: the payload is a seller id and a staff
 * id, both of which the server can verify cheaply and neither of which is worth
 * a database round trip on every request. The signature is what makes it safe —
 * without it the cookie is a text field naming which house you would like to be.
 *
 * ONE-TIME CODES USED TO LIVE HERE TOO, in a `Map` on `globalThis` that the
 * operator portal borrowed. They now live in Postgres behind `LoginCodeStore`
 * (WORK_PLAN 11.2, migration 0025), because a process-local store does not
 * survive a restart and does not exist across instances — and because the
 * shared `Map` was keyed on the phone ALONE, so a code issued for a house
 * verified at the operator console for the same number. The store keys on the
 * phone and the audience, and refuses the swap.
 */

const COOKIE = 'diyar_seller';

/**
 * The signing secret.
 *
 * In development it falls back to a fixed string, which is fine because the
 * whole sign-in path is a declared stub that `assertProductionSafe` refuses to
 * boot in production. In production the variable is required and the process
 * fails loudly without it — a signing key with a default is not a key.
 */
function secret(): string {
  const configured = process.env.SELLER_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SELLER_SESSION_SECRET is required in production');
  }
  return 'development-only-not-a-secret';
}

const sign = (payload: string): string =>
  createHmac('sha256', secret()).update(payload).digest('base64url');

/**
 * Constant-time comparison.
 *
 * `a === b` on a signature leaks how many leading bytes matched through timing.
 * The length check first is deliberate: `timingSafeEqual` THROWS on mismatched
 * lengths rather than returning false, which would turn a forged cookie into a
 * 500 and hand an attacker a much louder oracle than the timing one.
 */
function signatureMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueSellerSession(session: SellerSession): Promise<void> {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60,
  });
}

export async function readSellerSession(): Promise<SellerSession | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!signatureMatches(sign(payload), signature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SellerSession;
    // The expiry is checked HERE as well as by the cookie's maxAge, because a
    // cookie's lifetime is enforced by the browser and the browser is the one
    // party in this exchange we do not control.
    if (!isSessionValid(session, Date.now())) return null;
    return session;
  } catch {
    return null;
  }
}

export async function clearSellerSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
