'use server';

import { revalidatePath } from 'next/cache';
import type { ModerationReason } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Moderating a listing.
 *
 * It lives with the OPS feature rather than beside the seller's own listing
 * actions, because the actor is what decides where an action belongs. A
 * platform decision filed under `features/seller` reads as something a house
 * can do, and the first person to skim the folder would believe it.
 */

export interface ModerationResult {
  readonly ok: boolean;
  readonly message?: string;
}

export async function decideListing(
  id: string,
  to: 'published' | 'draft' | 'suspended',
  reason: ModerationReason | null,
): Promise<ModerationResult> {
  const session = await activeOperator();
  if (!session) return { ok: false, message: 'انتهت الجلسة.' };

  try {
    await api(
      { role: 'platform', id: session.authUserId },
      null,
      { staffId: session.staffId, role: session.role },
    ).listings.decide({ id, to, reason });

    revalidatePath('/ops/moderation');
    /*
     * The shopfront too. Publishing or suspending changes what a visitor can
     * buy, and a route cache still serving a suspended listing is an order for
     * something the platform has just taken down.
     */
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function fetchModerationQueue() {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role },
  ).listings.queue();
}
