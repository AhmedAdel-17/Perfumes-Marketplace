'use server';

import { revalidatePath } from 'next/cache';
import type { ReturnState } from '@diyar/domain';
import { api } from '@/core/api';
import { activeSellerSession } from './actions';

/**
 * A house's own returns.
 *
 * The house decides whether to take a bottle back and records that it arrived.
 * It cannot refund: money is the platform's to move, and a house that could
 * mark a return refunded could close a case without paying anybody.
 */

const caller = async () => {
  const session = await activeSellerSession();
  if (!session) return null;
  return api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId);
};

export async function fetchReturnQueue() {
  const client = await caller();
  return client ? client.returns.queue() : null;
}

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function decideReturn(id: string, to: ReturnState): Promise<DecisionResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة. سجّل الدخول مرّة أخرى.' };

  try {
    await client.returns.decide({ id, to });
    revalidatePath('/seller/returns');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
