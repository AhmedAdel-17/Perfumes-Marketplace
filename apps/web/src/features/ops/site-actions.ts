'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Announcements and curation, from the console.
 *
 * Both revalidate `/` as a LAYOUT, because both change something that appears
 * on every screen: the announcement bar lives in the masthead, and the hero is
 * the homepage. Revalidating one path would leave the notice missing everywhere
 * except the page the operator happened to be on.
 */

export interface SiteResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly objections?: readonly string[];
}

async function caller() {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role },
  );
}

const EXPIRED: SiteResult = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' };

export async function postAnnouncement(input: {
  message: string; messageEn: string | null; href: string | null; startsAt: string; endsAt: string;
}): Promise<SiteResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const result = await call.site.post(input);
    revalidatePath('/ops/site');
    revalidatePath('/', 'layout');
    return result.posted
      ? { ok: true }
      : { ok: false, objections: result.objections };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function endAnnouncement(id: string): Promise<SiteResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const result = await call.site.endAnnouncement({ id });
    revalidatePath('/ops/site');
    revalidatePath('/', 'layout');
    // Spread rather than assign: under `exactOptionalPropertyTypes` a property
    // present and holding `undefined` is a different type from an absent one,
    // and the router omits `message` entirely on success.
    return result.ended
      ? { ok: true }
      : { ok: false, ...(result.message ? { message: result.message } : {}) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function setCuration(
  heroProductId: string | null, featuredProductIds: string[],
): Promise<SiteResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.site.setCuration({ heroProductId, featuredProductIds });
    revalidatePath('/ops/site');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
