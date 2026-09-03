'use server';

import { redirect } from 'next/navigation';
import { consoleOtpSender, type SellerSession } from '@diyar/api';
import { api } from '@/core/api';
import { database } from '@/core/db';
import { schema } from '@diyar/db';
import { and, eq, isNull } from 'drizzle-orm';
import {
  clearSellerSession, issueCode, issueSellerSession, readSellerSession, verifyCode,
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

  const [staff] = await database()
    .select({ sellerId: schema.sellerStaff.sellerId })
    .from(schema.sellerStaff)
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.sellerStaff.sellerId))
    .where(and(
      eq(schema.sellers.contactPhone, trimmed),
      isNull(schema.sellerStaff.revokedAt),
    ))
    .limit(1);

  if (!staff) return generic;

  await consoleOtpSender.send({ phone: trimmed, code: issueCode(trimmed) });
  return generic;
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export async function verifySellerCode(phone: string, code: string): Promise<VerifyResult> {
  const trimmed = phone.trim();
  const verdict = verifyCode(trimmed, code.trim());

  if (verdict === 'too_many_attempts') {
    return { ok: false, message: 'محاولات كثيرة. اطلب رمزًا جديدًا.' };
  }
  if (verdict !== 'ok') {
    // "wrong" and "expired" get one message. Distinguishing them tells someone
    // guessing which half of the problem to work on.
    return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };
  }

  const [staff] = await database()
    .select({
      sellerId: schema.sellerStaff.sellerId,
      authUserId: schema.sellerStaff.authUserId,
    })
    .from(schema.sellerStaff)
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.sellerStaff.sellerId))
    .where(and(
      eq(schema.sellers.contactPhone, trimmed),
      isNull(schema.sellerStaff.revokedAt),
    ))
    .limit(1);

  if (!staff) return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };

  await issueSellerSession({
    sellerId: staff.sellerId,
    staffAuthUserId: staff.authUserId,
    issuedAt: Date.now(),
  });
  return { ok: true };
}

export async function signOutSeller(): Promise<void> {
  await clearSellerSession();
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
  const session = await readSellerSession();
  if (!session) return null;

  /*
    The signature proves the cookie is OURS. It does not prove the access behind
    it still exists.

    A staff member removed from a house — or a house suspended — keeps a
    correctly signed cookie until it expires, which is twelve hours of continued
    access after their access was taken away. Revocation that takes effect
    "eventually" is not revocation.

    Found by re-seeding the database and watching a signed-in house get an empty
    queue and no explanation rather than being signed out. The same shape as a
    real revocation, arrived at by accident.

    One indexed lookup per request is the right price for a revocation that
    takes effect on the next click.
  */
  const [staff] = await database()
    .select({ id: schema.sellerStaff.id })
    .from(schema.sellerStaff)
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.sellerStaff.sellerId))
    .where(and(
      eq(schema.sellerStaff.sellerId, session.sellerId),
      eq(schema.sellerStaff.authUserId, session.staffAuthUserId),
      isNull(schema.sellerStaff.revokedAt),
    ))
    .limit(1);

  if (!staff) {
    // Best-effort tidy-up, and deliberately not load-bearing.
    //
    // Next refuses cookie WRITES during a page render — they are only legal in
    // a Server Action or Route Handler — so this throws when the guard runs
    // from the queue page, which is precisely where a revoked session first
    // arrives. The security property is the `null` below: access is refused
    // whether or not the stale cookie could be cleared. Deleting it just saves
    // the browser from resending something already known to be dead.
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
