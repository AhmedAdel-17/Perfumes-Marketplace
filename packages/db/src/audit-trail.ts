/**
 * The audit trail, on Drizzle.
 *
 * Writes go through the same Unit of Work as the decision they record, so the
 * two commit together. That is the whole reason this is a repository rather
 * than a logger: a decision that succeeded while its audit entry failed is a
 * decision nobody can account for, and the failure would be invisible.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
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
      ...(options.action ? [eq(schema.auditLog.action, options.action)] : []),
      /*
       * The keyset, compared as a ROW and looked up in SQL.
       *
       * `(occurred_at, id) < (subselect)` is Postgres row comparison: earlier
       * time, or the same time and a lower id — exactly the reverse of the
       * ORDER BY below. The cursor's time never leaves the database, so the
       * microseconds that a JavaScript Date would drop are still there to
       * compare. An id matching no row makes the subselect NULL, and NULL
       * admits nothing.
       */
      ...(options.before !== undefined
        ? [sql`(${schema.auditLog.occurredAt}, ${schema.auditLog.id}) < (
            SELECT c.occurred_at, c.id FROM audit_log c WHERE c.id = ${options.before}::uuid
          )`]
        : []),
    ];

    const rows = await db.select().from(schema.auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      // The id breaks ties. Entries written by one transaction share `now()`
      // to the microsecond, and without a tiebreak their order is whatever the
      // planner returns — which a cursor cannot page through.
      .orderBy(desc(schema.auditLog.occurredAt), desc(schema.auditLog.id))
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
