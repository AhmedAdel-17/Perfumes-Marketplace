'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Moderating a review.
 *
 * Filed under OPS because the actor decides where an action belongs: a house
 * cannot do any of this, and a file named for the platform's authority is the
 * one place somebody looking for "can a seller delete a bad review?" will look.
 * The answer, in this codebase, is that there is no function anywhere that
 * deletes one.
 */

export interface ModerationResult {
  readonly ok: boolean;
  readonly message?: string;
}

const caller = async () => {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );
};

export async function fetchReviewQueue() {
  const api = await caller();
  return api ? api.reviews.queue({ limit: 100 }) : null;
}

export async function hideReview(id: string, note: string): Promise<ModerationResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };

  try {
    await client.reviews.hide({ id, note });
    revalidatePath('/ops/reviews');
    /*
     * The shopfront too. A review hidden here is a review that must stop being
     * counted in the average on the product page and on every tile that shows
     * one — a cached rating that still includes it is the platform failing to
     * carry out its own decision.
     */
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function restoreReview(id: string): Promise<ModerationResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };

  try {
    await client.reviews.restore({ id });
    revalidatePath('/ops/reviews');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
