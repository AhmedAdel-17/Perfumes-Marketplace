'use server';

import { revalidatePath } from 'next/cache';
import type { NoteIcon } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * The notes glossary, from the console. Each write lands in the audit log (the
 * router records it) and refreshes every product page, because every page that
 * carries the note prints the new name.
 */
export interface GlossaryResult {
  readonly ok: boolean;
  readonly message?: string;
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

const EXPIRED: GlossaryResult = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' };

export async function fetchGlossary() {
  const call = await caller();
  if (!call) return null;
  return call.glossary.entries();
}

export async function setNoteEnglish(ar: string, en: string, icon: NoteIcon | null): Promise<GlossaryResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.glossary.set({ ar, en, icon });
    revalidatePath('/ops/notes');
    revalidatePath('/p/[slug]', 'page');
    // The home page's note index prints the drawing too.
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, message: 'تعذّر الحفظ. الاسم من حرف إلى ٤٠ حرفًا.' };
  }
}

export async function removeNoteEnglish(ar: string): Promise<GlossaryResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.glossary.remove({ ar });
    revalidatePath('/ops/notes');
    revalidatePath('/p/[slug]', 'page');
    return { ok: true };
  } catch {
    return { ok: false, message: 'تعذّر الحذف.' };
  }
}
