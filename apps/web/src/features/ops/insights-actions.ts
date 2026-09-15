'use server';

import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * The owner's report, for the console.
 *
 * Read-only, and computed entirely behind the API: this action passes the
 * period through and hands back what came out. A refusal is RETURNED rather
 * than thrown, because the router refuses operators who are not admins, and
 * the page should say so in a sentence rather than fall over.
 */
export type ReportDays = 1 | 7 | 30 | 90;

export async function fetchOwnerReport(days: ReportDays) {
  const session = await activeOperator();
  if (!session) return null;

  const client = await api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );

  try {
    return { ok: true as const, report: await client.insights.owner({ days }) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}
