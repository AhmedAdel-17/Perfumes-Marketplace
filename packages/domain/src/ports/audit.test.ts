/**
 * The audit trail's read contract, run against the in-memory adapter.
 *
 * `packages/db` runs the identical list against Drizzle + Postgres.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../testing/in-memory-repositories';
import { auditContract, type AuditContractWorld } from './audit-contract';

const harness = async (): Promise<AuditContractWorld> => ({ uow: new InMemoryUnitOfWork() });

describe('audit contract — in-memory adapter', () => {
  for (const testCase of auditContract) {
    it(testCase.name, async () => {
      await expect(testCase.run(harness)).resolves.toBeUndefined();
    });
  }

  it('runs a meaningful number of cases, so an empty contract cannot pass silently', () => {
    expect(auditContract.length).toBeGreaterThanOrEqual(6);
  });
});
