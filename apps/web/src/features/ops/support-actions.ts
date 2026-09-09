'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * The support queue, from the operator's side.
 *
 * `nextAction` is written back to the customer — it is what the lookup screen
 * shows them — so it is the one field here that is not internal.
 */

const caller = async () => {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );
};

export async function fetchTickets(includeClosed = false) {
  const client = await caller();
  return client ? client.support.queue({ includeClosed, limit: 100 }) : null;
}

export type UpdateResult = { ok: true } | { ok: false; message: string };

export async function updateTicket(input: {
  id: string;
  status: 'open' | 'waiting' | 'resolved' | 'closed';
  nextAction: string | null;
}): Promise<UpdateResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };

  try {
    await client.support.update(input);
    revalidatePath('/ops/support');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
