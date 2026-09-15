/**
 * The audit trail's read contract, run against Drizzle + Postgres.
 *
 * This is the half that matters. Entries written in one transaction share
 * `now()` to the microsecond only here — the in-memory adapter stamps each one
 * a second apart — so a cursor that loses entries at a page boundary would pass
 * every in-memory case and fail only in production.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { auditContract, type AuditContractWorld } from '@diyar/domain';
import { applyMigrations } from './migrate';
import * as schema from './schema/index';
import { DrizzleUnitOfWork, type DiyarDatabase } from './repositories';

const PLATFORM = '99999999-9999-9999-9999-999999999999';

const harness = async (): Promise<AuditContractWorld> => {
  const pg = new PGlite();
  await applyMigrations(pg);
  const db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  return { uow: new DrizzleUnitOfWork(db, { role: 'platform', id: PLATFORM }) };
};

describe('audit contract — Drizzle + Postgres adapter', () => {
  for (const testCase of auditContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    }, 60_000);
  }
});
