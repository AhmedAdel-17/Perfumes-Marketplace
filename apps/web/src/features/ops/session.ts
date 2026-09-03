import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * The operator's signed-in state.
 *
 * A separate cookie from the seller's, and separately signed, so a seller
 * session can never be presented as an operator one — even if a bug elsewhere
 * confused the two payload shapes. Two names, two secrets-in-effect, no
 * overlap.
 *
 * The window is deliberately SHORTER than the seller's twelve hours. An
 * operator can release money; a house can only work its own queue. A session
 * length is a statement about what an unattended browser is worth to an
 * attacker, and these are not worth the same.
 */
export interface OpsSession {
  readonly staffId: string;
  readonly authUserId: string;
  readonly fullName: string;
  readonly issuedAt: number;
}

const COOKIE = 'diyar_ops';
const TTL_MS = 4 * 60 * 60 * 1000;

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

const sign = (payload: string): string =>
  createHmac('sha256', secret()).update(payload).digest('base64url');

function signatureMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  // Length first: timingSafeEqual THROWS on a mismatch rather than returning
  // false, which would turn a forged cookie into a 500.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueOpsSession(session: OpsSession): Promise<void> {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

export async function readOpsSession(): Promise<OpsSession | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!signatureMatches(sign(payload), signature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OpsSession;
    const age = Date.now() - session.issuedAt;
    // Rejecting a future `issuedAt` too: clock skew or a forged timestamp must
    // not buy extra hours.
    if (age < 0 || age >= TTL_MS) return null;
    return session;
  } catch {
    return null;
  }
}

export async function clearOpsSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
