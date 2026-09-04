'use server';

import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@diyar/db';
import { consoleOtpSender } from '@diyar/api';
import { api } from '@/core/api';
import { database } from '@/core/db';
import {
  clearOpsSession, issueOpsSession, readOpsSession,
} from './session';
import { issueCode, verifyCode } from '@/features/seller/session';

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

async function findOperator(phone: string) {
  const [row] = await database()
    .select({
      id: schema.platformStaff.id,
      authUserId: schema.platformStaff.authUserId,
      fullName: schema.platformStaff.fullName,
    })
    .from(schema.platformStaff)
    .where(and(
      eq(schema.platformStaff.phone, phone),
      isNull(schema.platformStaff.revokedAt),
    ))
    .limit(1);
  return row ?? null;
}

export async function requestOpsCode(phone: string): Promise<OpsResult> {
  const trimmed = phone.trim();
  if (!EGYPTIAN_MOBILE.test(trimmed)) {
    return { ok: false, message: 'رقم موبايل مصري غير صحيح' };
  }

  // Success regardless. Confirming which numbers belong to marketplace
  // operators would hand an attacker the shortlist of accounts worth attacking.
  if (await findOperator(trimmed)) {
    await consoleOtpSender.send({ phone: trimmed, code: issueCode(trimmed) });
  }
  return { ok: true };
}

export async function verifyOpsCode(phone: string, code: string): Promise<OpsResult> {
  const trimmed = phone.trim();
  const verdict = verifyCode(trimmed, code.trim());

  if (verdict === 'too_many_attempts') {
    return { ok: false, message: 'محاولات كثيرة. اطلب رمزًا جديدًا.' };
  }
  if (verdict !== 'ok') {
    return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };
  }

  const operator = await findOperator(trimmed);
  if (!operator) return { ok: false, message: 'الرمز غير صحيح أو انتهت صلاحيته.' };

  await issueOpsSession({
    staffId: operator.id,
    authUserId: operator.authUserId,
    fullName: operator.fullName,
    issuedAt: Date.now(),
  });
  return { ok: true };
}

export async function signOutOps(): Promise<void> {
  await clearOpsSession();
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
  const session = await readOpsSession();
  if (!session) return null;

  const [row] = await database()
    // The role comes back with the id, because it is read at the same moment
    // and for the same reason: what this operator may do is a fact about the
    // CURRENT row, not about the cookie they signed in with.
    .select({ id: schema.platformStaff.id, role: schema.platformStaff.role })
    .from(schema.platformStaff)
    .where(and(
      eq(schema.platformStaff.id, session.staffId),
      isNull(schema.platformStaff.revokedAt),
    ))
    .limit(1);

  if (!row) {
    // Best-effort: Next refuses cookie writes during a page render, which is
    // exactly where a revoked session arrives. Refusing access is the security
    // property; clearing the cookie is tidying.
    await clearOpsSession().catch(() => undefined);
    return null;
  }
  return { ...session, role: row.role };
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

export async function opsRunPayout(sellerId: string, periodStart: string, periodEnd: string) {
  const caller = await opsCaller();
  if (!caller) return null;
  try {
    return await caller.platform.runPayout({ sellerId, periodStart, periodEnd });
  } catch {
    return null;
  }
}
