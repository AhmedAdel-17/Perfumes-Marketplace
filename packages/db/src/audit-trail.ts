/**
 * The audit trail, on Drizzle.
 *
 * Writes go through the same Unit of Work as the decision they record, so the
 * two commit together. That is the whole reason this is a repository rather
 * than a logger: a decision that succeeded while its audit entry failed is a
 * decision nobody can account for, and the failure would be invisible.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { AuditAction, AuditRecord, AuditTrail } from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

export const auditTrail = (db: DiyarDatabase): AuditTrail => ({
  async record(entry) {
    await db.insert(schema.auditLog).values({
      action: entry.action,
      actorId: entry.actorId,
      actorLabel: entry.actorLabel,
      entityTable: entry.entityTable,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      note: entry.note ?? null,
    });
  },

  async recent(options = {}) {
    const conditions = [
      ...(options.entityTable ? [eq(schema.auditLog.entityTable, options.entityTable)] : []),
      ...(options.entityId ? [eq(schema.auditLog.entityId, options.entityId)] : []),
    ];

    const rows = await db.select().from(schema.auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.auditLog.occurredAt))
      // A cap by default. An audit log grows without bound by design, and a
      // console that fetches all of it works for a year and then does not.
      .limit(options.limit ?? 100);

    return rows.map((row): AuditRecord => ({
      id: row.id,
      action: row.action as AuditAction,
      actorId: row.actorId,
      actorLabel: row.actorLabel,
      entityTable: row.entityTable,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      note: row.note,
      occurredAt: row.occurredAt,
    }));
  },
});
