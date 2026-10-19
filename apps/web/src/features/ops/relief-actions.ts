'use server';

import { revalidatePath } from 'next/cache';
import type { ReliefMethod, ReliefPlacement } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Reliefs, from the console (Le Dévoilement; migration 0032). The making
 * happens in the operator's browser; these are the server's half — sign the
 * two uploads, confirm what arrived, remove — and each write lands in the
 * audit log (the router records it) and refreshes the perfume's page.
 */
export interface ReliefActionResult {
  readonly ok: boolean;
  readonly message?: string;
}

async function caller() {
  const session = await activeOperator();
  if (!session) return null;
  return api({ role: 'platform', id: session.authUserId }, null, { staffId: session.staffId, role: session.role });
}

const EXPIRED: ReliefActionResult = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' };
const said = (error: unknown, fallback: string) => (error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : fallback);

export async function fetchReliefs(productId?: string) {
  const call = await caller();
  if (!call) return null;
  return call.reliefs.list(productId ? { productId } : undefined);
}

export async function startReliefUpload(productId: string, mediaId: string) {
  const call = await caller();
  if (!call) return { ok: false as const, message: EXPIRED.message };
  try {
    const signed = await call.reliefs.startUpload({ productId, mediaId });
    return { ok: true as const, ...signed };
  } catch (error) {
    return { ok: false as const, message: said(error, 'تعذّر بدء الرفع. حاول مرة أخرى.') };
  }
}

export async function confirmRelief(input: {
  productId: string;
  mediaId: string;
  slug: string;
  cutoutKey: string;
  reliefKey: string;
  placement: ReliefPlacement;
  method: ReliefMethod;
  opaque: boolean;
}): Promise<ReliefActionResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const { slug, ...rest } = input;
    await call.reliefs.confirm(rest);
    revalidatePath('/ops/reliefs');
    revalidatePath(`/p/${slug}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: said(error, 'تعذّر الحفظ. أعد صنع العرض المجسّم.') };
  }
}

export async function removeRelief(productId: string, mediaId: string, slug: string): Promise<ReliefActionResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.reliefs.remove({ productId, mediaId });
    revalidatePath('/ops/reliefs');
    revalidatePath(`/p/${slug}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: said(error, 'تعذّر الحذف.') };
  }
}
