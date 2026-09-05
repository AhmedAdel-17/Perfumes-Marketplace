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

export interface AuditTrail {
  record(entry: AuditEntry): Promise<void>;

  /** Newest first. Optionally narrowed to one entity's history. */
  recent(options?: {
    entityTable?: string;
    entityId?: string;
    limit?: number;
  }): Promise<AuditRecord[]>;
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
