/**
 * Every audit entry knows which request wrote it (task P1.4.3, migration 0029).
 *
 * No router passes a request id to `audit.record()`, and that is the design:
 * the Unit of Work sets `app.request_id` per transaction and the column default
 * fills itself. So the claim to prove is about the MECHANISM — that an entry
 * written inside a request carries its id, that one written outside carries
 * none, and that a malformed id cannot make the audit trail refuse to write.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';

let pg: PGlite;
let db: DiyarDatabase;

const PLATFORM = { role: 'platform' as const, id: '99999999-9999-9999-9999-999999999999' };
const REQUEST = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const record = (uow: DrizzleUnitOfWork, note: string) =>
  uow.transaction((r) => r.audit.record({
    action: 'payout_adjustment',
    actorId: null,
    actorLabel: 'اختبار',
    entityTable: 'sub_orders',
    entityId: null,
    after: null,
    note,
  } as never));

const requestIdOf = async (note: string) =>
  (await pg.query<{ request_id: string | null }>(
    `SELECT request_id FROM audit_log WHERE note = $1`, [note])).rows[0]?.request_id;

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
});

describe('an audit entry carries the request that wrote it', () => {
  it('is stamped with the request id, though nobody passed it', async () => {
    await record(new DrizzleUnitOfWork(db, PLATFORM, 'app_user', async () => REQUEST), 'inside');
    expect(await requestIdOf('inside')).toBe(REQUEST);
  });

  it('carries none when written outside a request — which is true, and not an error', async () => {
    await record(new DrizzleUnitOfWork(db, PLATFORM), 'outside');
    expect(await requestIdOf('outside')).toBeNull();
  });

  it('a malformed id is ignored, not allowed to break the trail', async () => {
    /*
     * The column casts to uuid. If a bad value reached the GUC, every audit
     * write in that transaction would fail — the trail would start refusing to
     * record decisions. The Unit of Work sets only a well-formed UUID.
     */
    await record(
      new DrizzleUnitOfWork(db, PLATFORM, 'app_user', async () => "'; DROP TABLE audit_log; --"),
      'malformed',
    );
    expect(await requestIdOf('malformed')).toBeNull();
  });

  it('keeps the id when the Unit of Work is re-scoped to another actor', async () => {
    // `as()` is how a router hands the same request to a different role; the
    // request did not change, so neither should its name.
    const uow = new DrizzleUnitOfWork(db, PLATFORM, 'app_user', async () => REQUEST);
    await record(uow.as(PLATFORM), 're-scoped');
    expect(await requestIdOf('re-scoped')).toBe(REQUEST);
  });

  it('does not leak one transaction’s id into the next', async () => {
    // `set_config(..., true)` is transaction-local. A pooled connection reused
    // by a later request must not file that request's entries under this one.
    await record(new DrizzleUnitOfWork(db, PLATFORM, 'app_user', async () => REQUEST), 'first');
    await record(new DrizzleUnitOfWork(db, PLATFORM), 'second');
    expect(await requestIdOf('second')).toBeNull();
  });
});
