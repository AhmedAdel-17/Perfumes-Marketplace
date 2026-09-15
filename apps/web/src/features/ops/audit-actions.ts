'use server';

import type { AuditAction } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * The audit trail, for the console.
 *
 * Read-only. There is no action in this file that writes, and the router has
 * no procedure that could — entries are written by the decisions they record.
 */
export async function fetchAuditPage(input: { action?: AuditAction; before?: string }) {
  const session = await activeOperator();
  if (!session) return null;

  const client = await api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );

  return client.audit.recent({
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.before === undefined ? {} : { before: input.before }),
    limit: 50,
  });
}
