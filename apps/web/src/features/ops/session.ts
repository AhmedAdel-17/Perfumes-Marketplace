import 'server-only';
import { cookies } from 'next/headers';
import { OPS_SESSION_TTL_MS } from '@diyar/api';
import { identity } from '@/core/identity';
import { openSessionId, requestFingerprint, sealSessionId } from '@/core/session-cookie';

/**
 * The operator's signed-in state.
 *
 * A separate cookie from the seller's, and separately signed, so a seller
 * session can never be presented as an operator one — and since task P3.4.2
 * the row behind it carries its audience too, so even a correctly signed id is
 * refused by the wrong console. Two names, two secrets, two audiences.
 *
 * A SESSION IS A ROW (migration 0028). The cookie carries an id and an HMAC;
 * the operator's name and CURRENT role are read from `platform_staff` on every
 * request, so a demotion or a removal takes effect on the next click and a
 * sign-out ends every copy of the cookie, not just this browser's.
 *
 * The window is deliberately SHORTER than the seller's twelve hours
 * (`OPS_SESSION_TTL_MS`). An operator can release money; a house can only work
 * its own queue. A session length is a statement about what an unattended
 * browser is worth to an attacker, and these are not worth the same.
 */
export interface OpsSession {
  readonly sessionId: string;
  readonly staffId: string;
  readonly authUserId: string;
  readonly fullName: string;
  /** The CURRENT role, read from the staff row now — never from the cookie. */
  readonly role: string;
  readonly issuedAt: number;
}

const COOKIE = 'diyar_ops';

function secret(): string {
  const configured = process.env.OPS_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OPS_SESSION_SECRET is required in production');
  }
  // Distinct from the seller's development fallback, so the two cookies are not
  // interchangeable even in development where both defaults are known.
  return 'development-only-not-a-secret-ops';
}

export async function issueOpsSession(staffId: string): Promise<void> {
  const sessionId = await identity.openSession({
    audience: 'platform',
    principalId: staffId,
    sellerId: null,
    ttlSeconds: OPS_SESSION_TTL_MS / 1000,
    ...(await requestFingerprint(secret())),
  });

  (await cookies()).set(COOKIE, sealSessionId(secret(), sessionId), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OPS_SESSION_TTL_MS / 1000,
  });
}

/**
 * The signed-in operator, if their access still exists.
 *
 * Not revoked, not expired by the database's clock, and not removed from
 * `platform_staff` — one query, every request.
 */
export async function readOpsSession(): Promise<OpsSession | null> {
  const sessionId = openSessionId(secret(), (await cookies()).get(COOKIE)?.value);
  if (!sessionId) return null;

  const active = await identity.activeOperatorSession(sessionId);
  if (!active) return null;

  return {
    sessionId: active.sessionId,
    staffId: active.staffId,
    authUserId: active.authUserId,
    fullName: active.fullName,
    role: active.role,
    issuedAt: active.issuedAt.getTime(),
  };
}

/** Revoke first, then forget the cookie — see `clearSellerSession` on why. */
export async function clearOpsSession(): Promise<void> {
  const jar = await cookies();
  const sessionId = openSessionId(secret(), jar.get(COOKIE)?.value);
  if (sessionId) await identity.revokeSession(sessionId);
  jar.delete(COOKIE);
}

/** End every open console session this operator has, on every device. */
export async function clearAllOpsSessions(staffId: string): Promise<number> {
  const ended = await identity.revokeAllSessions('platform', staffId);
  (await cookies()).delete(COOKIE);
  return ended;
}
