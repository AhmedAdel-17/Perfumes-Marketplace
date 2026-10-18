/** Replay isolation, expiry and rollback against real SQL/RLS in disposable PGlite. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrate';
import { DrizzleUnitOfWork, type ActorContext, type DiyarDatabase } from './repositories';
import * as schema from './schema/index';
let pg: PGlite;
let uow: DrizzleUnitOfWork;
const now = new Date('2026-10-18T00:00:00Z');
const later = new Date('2026-10-19T00:00:00Z');
const replay = { requestHash: 'a'.repeat(64), response: {
  reference: 'DY-REPLAY', totalPiastres: 10000, houseCount: 1, etaDaysMin: 3, etaDaysMax: 4,
} };
const protectedKey = crypto.randomUUID();
beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  uow = new DrizzleUnitOfWork(drizzle(pg, { schema }) as unknown as DiyarDatabase,
    { role: 'checkout', id: null });
  await uow.transaction(async (r) => {
    await r.checkoutReplay.lockAndRead(protectedKey, now);
    await r.checkoutReplay.save(protectedKey, replay, later);
  });
});
afterAll(async () => { await pg?.close(); });
describe('checkout replay repository', () => {
  it('replays within the window, including an upper-case UUID spelling', async () => {
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(protectedKey.toUpperCase(), now)))
      .toEqual(replay);
  });
  it('expires at the exact deadline and permits a new response without rewriting orders', async () => {
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(protectedKey, later))).toBeNull();
    const key = crypto.randomUUID();
    await uow.transaction(async (r) => {
      await r.checkoutReplay.lockAndRead(key, now);
      await r.checkoutReplay.save(key, replay, now);
    });
    const changed = { ...replay, requestHash: 'b'.repeat(64) };
    await uow.transaction(async (r) => {
      expect(await r.checkoutReplay.lockAndRead(key, now)).toBeNull();
      await r.checkoutReplay.save(key, changed, later);
    });
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(key, now))).toEqual(changed);
  });
  it('rolls back a saved response if later work fails', async () => {
    const key = crypto.randomUUID();
    await expect(uow.transaction(async (r) => {
      await r.checkoutReplay.lockAndRead(key, now);
      await r.checkoutReplay.save(key, replay, later);
      throw new Error('simulated transaction failure');
    })).rejects.toThrow('simulated transaction failure');
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(key, now))).toBeNull();
  });
  it.each(['anon', 'seller', 'customer', 'platform', 'aftercare'] as const)(
    'denies replay disclosure and writes to %s', async (role: ActorContext['role']) => {
      const actor = uow.as({ role, id: null });
      expect(await actor.transaction((r) => r.checkoutReplay.lockAndRead(protectedKey, now))).toBeNull();
      await expect(actor.transaction((r) => r.checkoutReplay.save(crypto.randomUUID(), replay, later)))
        .rejects.toThrow();
    });
});
