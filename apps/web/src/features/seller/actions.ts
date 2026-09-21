'use server';

import { redirect } from 'next/navigation';
import { consoleOtpSender, type SellerSession, consume, rateLimitMessage } from '@diyar/api';
import { api } from '@/core/api';
import { generateOtpCode } from '@diyar/api';
import { randomInt } from 'node:crypto';
import { loginCodes } from '@/core/login-codes';
import { identity } from '@/core/identity';
import {
  clearAllSellerSessions, clearSellerSession, issueSellerSession, readSellerSession,
} from './session';

/**
 * Seller sign-in and the order queue.
 *
 * Sign-in is a phone and a one-time code. The SMS provider is stubbed — the
 * code is printed to the server console — and the stub is declared, so
 * `assertProductionSafe` refuses to boot production while it is configured.
 * Everything else about the flow is real: the code is random, single-use,
 * expiring, and rate-limited, so the rejection paths are exercised here rather
 * than for the first time in front of a seller whose orders are timing out.
 */

export type RequestCodeResult = { ok: true } | { ok: false; message: string };

export async function requestSellerCode(phone: string): Promise<RequestCodeResult> {
  const trimmed = phone.trim();

  // The SAME answer whether or not this number belongs to a house. Telling an
  // attacker which phone numbers are sellers hands them a list worth having,
  // and the honest-looking "no such account" message is how that list gets
  // built.
  const generic = { ok: true as const };

  if (!/^(?:\+20|0)1[0125]\d{8}$/.test(trimmed)) {
    return { ok: false, message: 'رقم موبايل مصري غير صحيح' };
  }

  /*
   * Before a single code is issued.
   *
   * Every one-time code costs money and makes somebody's phone buzz, and
   * nothing here had a limit — so a script could ring a seller's number all
   * night for free. Counted on the ATTEMPT, because this function deliberately
   * returns the same answer whether or not the number belongs to an account,
   * and counting only real sends would make the difference observable.
   */
  const verdict = consume('otp', trimmed);
  if (!verdict.allowed) {
    return { ok: false, message: rateLimitMessage(verdict.retryAfterSeconds) };
  }

  const principal = await identity.sellerByContactPhone(trimmed);
  if (!principal) return generic;

  // `randomInt` is cryptographically secure; `Math.random()` is not, and a
  // predictable six-digit code is not a second factor. The code is held only
  // long enough to hand to the sender — the store keeps a digest of it.
  const code = generateOtpCode((max) => randomInt(max));
  await loginCodes().issue({ phone: trimmed, audience: 'seller', code });
  await consoleOtpSender.send({ phone: trimmed, code });
  return generic;
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export async function verifySellerCode(phone: string, code: string): Promise<VerifyResult> {
  const trimmed = phone.trim();
  const verdict = await loginCodes().verify({
    phone: trimmed, audience: 'seller', code: code.trim(),
  });

  if (verdict === 'too_many_attempts') {
    return { ok: false, message: 'محاولات كثيرة. اطلب رمزًا جديدًا.' };
  }
  if (verdict !== 'ok') {
    // "wrong" and "expired" get one message. Distinguishing them tells someone
    // guessing which half of the problem to work on.
    return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };
  }

  const principal = await identity.sellerByContactPhone(trimmed);
  if (!principal) return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };

  await issueSellerSession({
    sellerId: principal.sellerId,
    staffAuthUserId: principal.staffAuthUserId,
  });
  return { ok: true };
}

export async function signOutSeller(): Promise<void> {
  await clearSellerSession();
  redirect('/seller');
}

/**
 * Sign this staff member out of every device at once (migration 0028).
 *
 * There is no control for this in the portal yet — `design-reference/seller.html`
 * would have to be consulted before one is added — so this action exists, is
 * tested beneath it, and waits for its button. It takes no argument: the person
 * is read from the CURRENT session, so a crafted request cannot sign somebody
 * else out.
 */
export async function signOutSellerEverywhere(): Promise<void> {
  const session = await readSellerSession();
  if (session) await clearAllSellerSessions(session.staffAuthUserId);
  redirect('/seller');
}

/**
 * Everything below reads the session and passes it to the API as the actor.
 *
 * The sellerId comes from the SIGNED COOKIE and is never accepted as an
 * argument, so a crafted request cannot ask for another house's queue. RLS
 * would refuse anyway; this makes it impossible to express.
 */
/**
 * The signed-in house, if that access still exists.
 *
 * Exported because the queue PAGE has to make the same check the actions do:
 * guarding the page on the cookie alone renders the portal for someone whose
 * access was withdrawn and merely shows them nothing inside it.
 */
export async function activeSellerSession(): Promise<SellerSession | null> {
  /*
   * One read answers every way a session can die — revoked, expired by the
   * database's clock, or its staff member removed from the house — because the
   * session is a row now (migration 0028) and the read joins it to
   * `seller_staff`. This REPLACES the separate staff lookup that used to follow
   * the cookie check, and the twelve hours of access-after-removal that lookup
   * existed to prevent is still prevented, by the same query that ends a
   * signed-out session.
   */
  const session = await readSellerSession();
  if (!session) {
    // Best-effort tidy-up, and deliberately not load-bearing. Next refuses
    // cookie WRITES during a page render, which is exactly where a dead session
    // first arrives. The security property is the `null`: access is refused
    // whether or not the stale cookie could be cleared.
    await clearSellerSession().catch(() => undefined);
    return null;
  }
  return session;
}

async function sellerCaller() {
  const session = await activeSellerSession();
  if (!session) return null;
  return {
    session,
    caller: api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId),
  };
}

export async function fetchQueue() {
  const context = await sellerCaller();
  if (!context) return null;
  return context.caller.seller.queue();
}

export async function fetchPayouts() {
  const context = await sellerCaller();
  if (!context) return null;
  return context.caller.seller.payouts();
}

export async function fetchStatement(payoutId: string) {
  const context = await sellerCaller();
  if (!context) return null;
  return context.caller.seller.statement({ payoutId });
}

export async function confirmSubOrder(subOrderId: string) {
  const context = await sellerCaller();
  if (!context) return { ok: false as const, message: 'انتهت الجلسة. سجّل الدخول مرّة أخرى.' };
  try {
    const result = await context.caller.seller.confirm({ subOrderId });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, message: 'لم يعد هذا الطلب متاحًا.' };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function dispatchSubOrder(subOrderId: string, trackingNumber: string) {
  const context = await sellerCaller();
  if (!context) return { ok: false as const, message: 'انتهت الجلسة. سجّل الدخول مرّة أخرى.' };
  try {
    const result = await context.caller.seller.dispatch({ subOrderId, trackingNumber });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, message: 'لم يعد هذا الطلب متاحًا.' };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function declineSubOrder(subOrderId: string, reason: string) {
  const context = await sellerCaller();
  if (!context) return { ok: false as const, message: 'انتهت الجلسة. سجّل الدخول مرّة أخرى.' };
  try {
    const result = await context.caller.seller.decline({ subOrderId, reason: reason as never });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, message: 'لم يعد هذا الطلب متاحًا.' };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}
