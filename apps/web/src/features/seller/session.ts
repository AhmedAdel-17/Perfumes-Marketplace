import 'server-only';
import { cookies } from 'next/headers';
import { SELLER_SESSION_TTL_MS, type SellerSession } from '@diyar/api';
import { identity } from '@/core/identity';
import { openSessionId, requestFingerprint, sealSessionId } from '@/core/session-cookie';

/**
 * The seller's signed-in state.
 *
 * A SESSION IS A ROW (task P3.4.2, migration 0028). The cookie carries a
 * session id and an HMAC of it; who you are, which house, and whether you may
 * still be here are all read from `sessions` joined to `seller_staff`, on every
 * request. That one change is what makes three things possible that were not:
 *
 *   · signing out ends the session for EVERY copy of the cookie, not just the
 *     one in this browser;
 *   · "sign out everywhere" is one statement;
 *   · removing a staff member and revoking a session are refused by the same
 *     query, so neither can be forgotten while the other is remembered.
 *
 * The cookie used to be the session: a signed JSON payload with the house, the
 * person and a timestamp, whose expiry was decided by this server's clock. A
 * copy taken before sign-out kept working for the rest of its twelve hours,
 * because nothing on the server knew it had been signed out.
 *
 * ONE-TIME CODES USED TO LIVE HERE TOO, in a `Map` on `globalThis`. They are in
 * Postgres behind `LoginCodeStore` (WORK_PLAN 11.2, migration 0025).
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

/**
 * Open a session for a house and put its id in the cookie.
 *
 * The expiry is stamped by the DATABASE, with `now()`, from the length given
 * here. This process's clock decides nothing about how long a session lives.
 */
export async function issueSellerSession(
  principal: { sellerId: string; staffAuthUserId: string },
): Promise<void> {
  const sessionId = await identity.openSession({
    audience: 'seller',
    principalId: principal.staffAuthUserId,
    sellerId: principal.sellerId,
    ttlSeconds: SELLER_SESSION_TTL_MS / 1000,
    ...(await requestFingerprint(secret())),
  });

  (await cookies()).set(COOKIE, sealSessionId(secret(), sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SELLER_SESSION_TTL_MS / 1000,
  });
}

/**
 * The signed-in house, if that access still exists.
 *
 * The signature proves the cookie is OURS; the row proves the session is still
 * GOOD — not revoked, not expired by the database's clock, and its staff member
 * not removed from the house. Both questions are asked on every call, which is
 * one indexed lookup per request and the right price for revocation that takes
 * effect on the next click.
 */
export async function readSellerSession(): Promise<(SellerSession & { sessionId: string }) | null> {
  /*
   * The cookie is read FIRST, before the secret. `cookies()` is what tells Next
   * this route depends on the request and must render per request; evaluating
   * `secret()` first let it throw during a build-time prerender, before Next had
   * been told, and `next build` failed on a page that was never meant to be
   * static. Found by the first production build of 22 Sep 2026.
   */
  const raw = (await cookies()).get(COOKIE)?.value;
  const sessionId = openSessionId(secret(), raw);
  if (!sessionId) return null;

  const active = await identity.activeSellerSession(sessionId);
  if (!active) return null;

  return {
    sessionId: active.sessionId,
    sellerId: active.sellerId,
    staffAuthUserId: active.staffAuthUserId,
    issuedAt: active.issuedAt.getTime(),
  };
}

/**
 * Sign out: end the session on the server, then forget the cookie.
 *
 * The ORDER matters. Revoking first means that if deleting the cookie fails —
 * and Next refuses cookie writes during a page render — the session is already
 * dead, and the stale cookie is merely a pointer to nothing. The other order
 * would leave a working session behind whenever the second step failed.
 */
export async function clearSellerSession(): Promise<void> {
  const jar = await cookies();
  const sessionId = openSessionId(secret(), jar.get(COOKIE)?.value);
  if (sessionId) await identity.revokeSession(sessionId);
  jar.delete(COOKIE);
}

/**
 * End every open session this staff member has, on every device, and say how
 * many. "Sign me out everywhere" is the only honest answer to "I lost my phone",
 * and until migration 0028 it could not be expressed at all.
 */
export async function clearAllSellerSessions(staffAuthUserId: string): Promise<number> {
  const ended = await identity.revokeAllSessions('seller', staffAuthUserId);
  (await cookies()).delete(COOKIE);
  return ended;
}
