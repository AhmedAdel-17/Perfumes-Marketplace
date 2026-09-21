import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';

/**
 * The part of a session that lives in the browser: an id, and a signature.
 *
 * WHAT CHANGED (task P3.4.2, migration 0028). The cookie used to carry the
 * whole session — who you are, which house, when you signed in — signed so it
 * could not be edited. That made it a bearer credential the server could not
 * take back: signing out deleted it from one browser, and any copy made before
 * kept working until it expired. Now it carries a session id and nothing else.
 * The session is a row, and ending the row ends every copy of the cookie at
 * once.
 *
 * WHY THE ID IS STILL SIGNED. A session id is a random UUID, so guessing one is
 * already hopeless. The signature is for the day an id leaks somewhere it was
 * never meant to be — a log line, an error report, a support screenshot. An id
 * alone then opens nothing, because the attacker also needs the secret.
 *
 * ONE MODULE FOR BOTH CONSOLES, with the secret passed in. The seller and
 * operator cookies keep separate names and separate secrets, so one can never
 * be presented as the other, but the mechanics are identical and two copies of
 * a signature check are two places to get timing wrong.
 */

export const sign = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url');

/**
 * Constant-time comparison. The length check first is deliberate:
 * `timingSafeEqual` THROWS on mismatched lengths rather than returning false,
 * which would turn a forged cookie into a 500 and hand an attacker a louder
 * oracle than the timing one.
 */
function matches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A UUID and nothing else — anything else in the id slot is a forgery. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sealSessionId = (secret: string, sessionId: string): string =>
  `${sessionId}.${sign(secret, sessionId)}`;

/**
 * The session id inside a cookie, if the cookie is genuinely ours.
 *
 * Returns the id only. Whether that session is still GOOD — not revoked, not
 * expired, its person not removed — is the database's question, asked by the
 * caller, because a signature can prove the cookie is ours and can never prove
 * the access behind it still exists.
 */
export function openSessionId(secret: string, raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;

  const id = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!UUID.test(id)) return null;
  return matches(sign(secret, id), signature) ? id : null;
}

/**
 * Where a sign-in came from, as KEYED hashes.
 *
 * Kept to answer two comparisons — "is this the same browser", "was this
 * opened from somewhere unusual" — neither of which needs to read the value
 * back. A plain SHA-256 of an IPv4 address can be reversed by hashing all four
 * billion of them in minutes, so it is an HMAC under the session secret: without
 * the secret the hash is not an address, and with it you could have read the
 * address anyway. PDPL 151/2020 asks for minimal collection; this is the least
 * that still answers the question.
 */
export async function requestFingerprint(secret: string) {
  const h = await headers();
  // The first address in X-Forwarded-For is the client; the rest are proxies.
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const ua = h.get('user-agent');
  return {
    ipHash: ip ? sign(secret, `ip:${ip}`) : null,
    uaHash: ua ? sign(secret, `ua:${ua}`) : null,
  };
}
