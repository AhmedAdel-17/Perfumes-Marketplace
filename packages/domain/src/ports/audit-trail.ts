/**
 * Port: the audit trail.
 *
 * Doc 04 §8 makes it a gate: "Admin actions, fee changes and payout adjustments
 * are auditable." The table has existed since the first migration and NOTHING
 * HAS EVER WRITTEN TO IT — which is worse than not having one, because a schema
 * that promises an audit trail is read as having one.
 *
 * WHAT GOES IN, AND WHAT DOES NOT. This records decisions a PERSON made about
 * somebody else: a listing refused, a payout adjusted, a house suspended, a
 * rate changed. It is not an event log and it is not analytics. An order moving
 * from dispatched to delivered is the system doing its job and already has its
 * own transition record; putting it here too would bury the twelve entries a
 * year that matter under ten thousand that do not.
 *
 * The test is: would somebody, one day, need to ask WHO DECIDED THIS AND WHY?
 * If nobody would, it does not belong here.
 */

/**
 * The vocabulary, mirroring the `audit_action` enum.
 *
 * A larger list than anything writes to yet, and deliberately so: it came from
 * the founding pack rather than from what happens to be implemented, and
 * shrinking it to today's features would mean widening it again in a migration
 * every time one lands.
 */
export const AUDIT_ACTIONS = [
  'seller_status_change',
  'verification_decision',
  'listing_moderation',
  'review_moderation',
  'commission_rate_change',
  'payout_approval',
  'payout_adjustment',
  'policy_change',
  'staff_permission_change',
  'privacy_request',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  readonly action: AuditAction;
  /** The `platform_staff` row, where there is one. Null for the system. */
  readonly actorId: string | null;
  /**
   * Who it was, in words, captured AT THE TIME.
   *
   * Denormalised on purpose. `actorId` can be revoked, renamed or deleted, and
   * an audit entry that resolves to "unknown staff member" two years later
   * answers none of the questions an audit exists to answer. The id is for
   * joining; this is for reading.
   */
  readonly actorLabel: string;
  readonly entityTable: string;
  readonly entityId: string | null;
  /**
   * The values that changed, as JSON text.
   *
   * Only the changed fields, never the whole row: a diff of one column is
   * readable and a dump of forty is not, and the dump quietly turns the audit
   * log into a second copy of every table it watches.
   */
  readonly before?: string | null;
  readonly after?: string | null;
  /** Free text, for the part a code cannot carry. Never instead of a code. */
  readonly note?: string | null;
}

export interface AuditRecord extends AuditEntry {
  readonly id: string;
  readonly occurredAt: Date;
}

export interface AuditQuery {
  readonly entityTable?: string;
  readonly entityId?: string;
  readonly action?: AuditAction;
  /**
   * The id of the last entry already shown. Only entries after it in
   * newest-first order are returned.
   *
   * A KEYSET, not an offset and not a timestamp. An offset shifts under a
   * reader when a decision is recorded between pages, so one entry appears
   * twice and another never appears. A timestamp skips entries that share an
   * instant — and they do: `occurred_at` defaults to the transaction's `now()`,
   * so two entries written by one decision are identical to the microsecond.
   *
   * An id rather than the (time, id) pair itself, because Postgres keeps
   * microseconds and a JavaScript `Date` keeps milliseconds: a pair that went
   * out to a browser and came back would have lost the precision the ordering
   * depends on. The adapter looks the row up and compares exactly.
   *
   * An id that names no entry returns nothing — a cursor from somewhere else is
   * not a page of this list.
   */
  readonly before?: string;
  readonly limit?: number;
}

export interface AuditTrail {
  record(entry: AuditEntry): Promise<void>;

  /**
   * Newest first, ordered by (occurredAt desc, id desc).
   *
   * Optionally narrowed to one entity's history, to one kind of decision, or
   * to what came before a cursor.
   */
  recent(options?: AuditQuery): Promise<AuditRecord[]>;
}

/**
 * The order `recent` returns, as a comparator.
 *
 * Stated once, in the domain, so the in-memory adapter sorts by the same rule
 * the SQL `ORDER BY` states — and so a cursor means the same thing to both.
 */
export function newestFirst(
  a: Pick<AuditRecord, 'occurredAt' | 'id'>,
  b: Pick<AuditRecord, 'occurredAt' | 'id'>,
): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * The changed fields between two versions of a row, as `before` and `after`.
 *
 * Returns nulls when nothing changed, so a caller can decline to write an entry
 * at all — an audit trail full of "somebody pressed save and changed nothing"
 * is one people stop reading, and an audit trail people stop reading is the
 * same as not having one.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  /*
   * Every key optional AND nullable, which `Partial<T>` alone is not.
   *
   * CLEARING a field is a change — arguably the one most worth recording, since
   * a value quietly becoming empty is harder to notice later than a value
   * changing. `Partial<T>` infers its member types from `before`, so a field
   * that held a string could not be shown becoming null: the type refused to
   * describe the update, and the test that tried to was committed broken.
   */
  after: Partial<{ [K in keyof T]: T[K] | null }>,
): { before: string | null; after: string | null } {
  const changed = Object.keys(after).filter(
    (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
  );

  if (changed.length === 0) return { before: null, after: null };

  const pick = (source: Record<string, unknown>) =>
    JSON.stringify(Object.fromEntries(changed.map((key) => [key, source[key] ?? null])));

  return { before: pick(before), after: pick(after) };
}
