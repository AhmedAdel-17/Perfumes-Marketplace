'use server';

import { revalidatePath } from 'next/cache';
import type { VerificationControl, VerificationStatus } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Houses applying to join.
 *
 * Going live is not a button this file can force. Migration 0001's trigger
 * refuses the transition unless all eight controls have passed, so `setStatus`
 * attempts the move and reports the database's answer — which means the rule
 * holds whatever this code believes.
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

export async function fetchApplications() {
  const client = await caller();
  return client ? client.applications.queue() : null;
}

export async function fetchApplication(id: string) {
  const client = await caller();
  return client ? client.applications.detail({ id }) : null;
}

export type OpsResult = { ok: true } | { ok: false; message: string };

export async function verifyControl(input: {
  sellerId: string;
  control: VerificationControl;
  status: VerificationStatus;
  notes: string | null;
}): Promise<OpsResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };
  try {
    await client.applications.verify(input);
    revalidatePath('/ops/houses');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function setHouseStatus(
  id: string,
  status: 'under_review' | 'approved' | 'live' | 'suspended' | 'terminated',
): Promise<OpsResult> {
  const client = await caller();
  if (!client) return { ok: false, message: 'انتهت الجلسة.' };
  try {
    await client.applications.setStatus({ id, status });
    revalidatePath('/ops/houses');
    // Going live changes the shopfront: a new house appears in the directory
    // and its listings become buyable.
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
