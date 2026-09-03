'use server';

import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * The operator's work queue.
 *
 * In its own module because `actions.ts` is where the MUTATIONS live, and a
 * file that both reads and writes tends to grow a helper that does one while
 * looking like the other.
 */
export async function fetchWorkQueue() {
  const session = await activeOperator();
  if (!session) return null;
  return api({ role: 'platform', id: session.authUserId }).platform.workQueue();
}
