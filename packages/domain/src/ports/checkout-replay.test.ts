/** In-memory adapter parity for replay expiry and Unit of Work rollback. */
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../testing/in-memory-repositories';
const now = new Date('2026-10-18T00:00:00Z');
const expiry = new Date('2026-10-19T00:00:00Z');
const key = 'abcdefab-1234-4234-8234-abcdefabcdef';
const replay = { requestHash: 'a'.repeat(64), response: {
  reference: 'DY-REPLAY', totalPiastres: 15000, houseCount: 1, etaDaysMin: 3, etaDaysMax: 4,
} };
describe('in-memory checkout replay port', () => {
  it('returns the committed response under either UUID spelling until expiry', async () => {
    const uow = new InMemoryUnitOfWork();
    await uow.transaction((r) => r.checkoutReplay.save(key, replay, expiry));
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(key.toUpperCase(), now))).toEqual(replay);
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(key, expiry))).toBeNull();
  });
  it('does not retain a response after a failed transaction', async () => {
    const uow = new InMemoryUnitOfWork();
    await expect(uow.transaction(async (r) => {
      await r.checkoutReplay.save(key, replay, expiry);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await uow.transaction((r) => r.checkoutReplay.lockAndRead(key, now))).toBeNull();
  });
});
