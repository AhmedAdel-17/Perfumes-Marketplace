'use server';

import { revalidatePath } from 'next/cache';
import type { CostBearer, ReturnState } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Returns, from the platform's side.
 *
 * This is where money moves, so it is also where the audit trail is written —
 * in the same transaction as the decision, by the router. Doc 04 §8 names a
 * payout adjustment as an auditable act, and a refund is one.
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

export async function fetchAllReturns() {
  const client = await caller();
  return client ? client.returns.all({ limit: 100 }) : null;
}

export type ResolveResult = { ok: true } | { ok: false; message: string };

export async function resolveReturn(input: {
  id: string;
  to: ReturnState;
  refundPiastres?: number;
  costBearer?: CostBearer;
}): Promise<ResolveResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };

  try {
    await client.returns.resolve({
      id: input.id,
      to: input.to,
      // `exactOptionalPropertyTypes`: a key present with `undefined` is not the
      // same as an absent key, and the router distinguishes them — a refund
      // amount sent as undefined alongside `refunded` would be rejected.
      ...(input.refundPiastres === undefined ? {} : { refundPiastres: input.refundPiastres }),
      ...(input.costBearer === undefined ? {} : { costBearer: input.costBearer }),
    });
    revalidatePath('/ops/returns');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
