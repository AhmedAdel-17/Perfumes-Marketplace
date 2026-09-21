'use server';

import { redirect } from 'next/navigation';
import { consume, rateLimitMessage, type ApiCaller } from '@diyar/api';
import { api } from '@/core/api';
import { identity } from '@/core/identity';
import { generateOtpCode } from '@diyar/api';
import { randomInt } from 'node:crypto';
import { loginCodes } from '@/core/login-codes';
import { otpSender } from '@/core/otp';
import {
  clearAllOpsSessions, clearOpsSession, issueOpsSession, readOpsSession,
} from './session';

/**
 * Marketplace operations.
 *
 * The same sign-in shape as the seller portal — phone, one-time code, signed
 * cookie, revalidated against the database on every request — because the
 * threat is identical and inventing a second mechanism would mean two places to
 * get session handling wrong.
 *
 * These people move money: they decide an order was delivered, that a courier
 * remitted cash, and that a payout may be issued. Everything here is therefore
 * attributable to a named row in `platform_staff`, and revocation takes effect
 * on the next click rather than when a cookie happens to expire.
 */

export type OpsResult = { ok: true } | { ok: false; message: string };

const EGYPTIAN_MOBILE = /^(?:\+20|0)1[0125]\d{8}$/;

const findOperator = (phone: string) => identity.operatorByPhone(phone);

export async function requestOpsCode(phone: string): Promise<OpsResult> {
  const trimmed = phone.trim();
  if (!EGYPTIAN_MOBILE.test(trimmed)) {
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

  // Success regardless. Confirming which numbers belong to marketplace
  // operators would hand an attacker the shortlist of accounts worth attacking.
  if (await findOperator(trimmed)) {
    /*
     * Issued for the `platform` audience, and that is a security property
     * rather than bookkeeping.
     *
     * Both portals used to share one in-process `Map` keyed on the phone alone,
     * so a code texted to a house verified here — at the console that releases
     * money — for the same number. The store keys on the phone AND the
     * audience, and answers a mismatch with the same 'expired' it gives an
     * unknown number, so which console a number belongs to stays unobservable.
     */
    const code = generateOtpCode((max) => randomInt(max));
    await loginCodes().issue({ phone: trimmed, audience: 'platform', code });
    await otpSender().send({ phone: trimmed, code });
  }
  return { ok: true };
}

export async function verifyOpsCode(phone: string, code: string): Promise<OpsResult> {
  const trimmed = phone.trim();
  const verdict = await loginCodes().verify({
    phone: trimmed, audience: 'platform', code: code.trim(),
  });

  if (verdict === 'too_many_attempts') {
    return { ok: false, message: 'محاولات كثيرة. اطلب رمزًا جديدًا.' };
  }
  if (verdict !== 'ok') {
    return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };
  }

  const operator = await findOperator(trimmed);
  if (!operator) return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };

  await issueOpsSession(operator.staffId);
  return { ok: true };
}

export async function signOutOps(): Promise<void> {
  await clearOpsSession();
  redirect('/ops');
}

/**
 * Sign this operator out of every device at once (migration 0028).
 *
 * No control exists for it in the console yet; `design-reference/admin.html`
 * is where one would be drawn. The person is read from the CURRENT session,
 * never taken as an argument, so a crafted request cannot sign somebody else
 * out.
 */
export async function signOutOpsEverywhere(): Promise<void> {
  const session = await readOpsSession();
  if (session) await clearAllOpsSessions(session.staffId);
  redirect('/ops');
}

/**
 * The operator, if their access still exists.
 *
 * A signature proves the cookie is ours; it does not prove the person still
 * works here. Someone removed from `platform_staff` keeps a valid cookie until
 * it expires, and for a role that can release money that window is not
 * acceptable. One indexed lookup buys revocation on the next click.
 */
export async function activeOperator() {
  /*
   * The session read IS the staff check now (migration 0028): it joins the
   * row to `platform_staff`, so a revoked session, an expired one and a
   * removed operator are all refused by the same query, and the role that comes
   * back is the one on the staff row at this moment — not the one they had
   * when they signed in.
   */
  const session = await readOpsSession();
  if (!session) {
    // Best-effort: Next refuses cookie writes during a page render, which is
    // exactly where a revoked session arrives. Refusing access is the security
    // property; clearing the cookie is tidying.
    await clearOpsSession().catch(() => undefined);
    return null;
  }
  return session;
}

async function opsCaller() {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );
}

export async function opsMarkDelivered(subOrderId: string): Promise<OpsResult> {
  const caller = await opsCaller();
  if (!caller) return { ok: false, message: 'انتهت الجلسة.' };
  try {
    const result = await caller.platform.markDelivered({ subOrderId });
    return result.ok ? { ok: true } : { ok: false, message: 'لم يعد هذا الطلب متاحًا.' };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function opsRecordRemittance(
  subOrderId: string,
  collectedPiastres: number,
): Promise<OpsResult> {
  const caller = await opsCaller();
  if (!caller) return { ok: false, message: 'انتهت الجلسة.' };
  try {
    await caller.platform.recordRemittance({ subOrderId, collectedPiastres });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * Run a payout — and, in production, be told why you cannot.
 *
 * NOTHING CALLS THIS. There is no operator screen with a payout control, which
 * is why P0.1.3's instruction to "hide or disable the control" had nothing to
 * hide; the task's LOG entry records that discrepancy. It is left reachable
 * because the guard belongs on the procedure rather than on a screen, and a
 * screen is not what stops a payout.
 *
 * It used to answer `null` for every failure, which swallowed the reason — the
 * thing `CLAUDE.md` §17 forbids, and exactly wrong for a refusal whose entire
 * value is the sentence it carries. Whoever builds that screen now gets the
 * message instead of a blank.
 */
type RunPayoutResult =
  | { ok: true; payout: Awaited<ReturnType<ApiCaller['platform']['runPayout']>> }
  | { ok: false; message: string };

export async function opsRunPayout(
  sellerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<RunPayoutResult> {
  const caller = await opsCaller();
  if (!caller) return { ok: false, message: 'انتهت الجلسة.' };
  try {
    return { ok: true, payout: await caller.platform.runPayout({ sellerId, periodStart, periodEnd }) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
