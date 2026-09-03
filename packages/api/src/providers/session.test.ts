import { describe, expect, it } from 'vitest';
import { isSessionValid, SELLER_SESSION_TTL_MS, type SellerSession } from './session';

/**
 * What a signed session does and does not prove.
 *
 * These are the invariants the web app's seller guard depends on. The guard
 * itself lives in apps/web because it needs cookies and a database; what is
 * testable in isolation is the rule it applies, and the rule is worth stating
 * plainly because it is easy to assume the signature settles everything.
 */
describe('a signature proves the cookie is ours, not that the access still exists', () => {
  const session: SellerSession = {
    sellerId: 'seller-1',
    staffAuthUserId: 'staff-1',
    issuedAt: 1_000_000,
  };

  it('accepts a session inside its window', () => {
    expect(isSessionValid(session, session.issuedAt)).toBe(true);
    expect(isSessionValid(session, session.issuedAt + SELLER_SESSION_TTL_MS - 1)).toBe(true);
  });

  it('rejects one at and past the boundary', () => {
    expect(isSessionValid(session, session.issuedAt + SELLER_SESSION_TTL_MS)).toBe(false);
    expect(isSessionValid(session, session.issuedAt + SELLER_SESSION_TTL_MS + 1)).toBe(false);
  });

  it('rejects one issued in the future', () => {
    // Clock skew, or a forged `issuedAt` reaching for an extra twelve hours.
    expect(isSessionValid(session, session.issuedAt - 1)).toBe(false);
  });

  it('says NOTHING about whether the staff member still has access', () => {
    // The point this documents: validity here is purely temporal. A staff
    // member removed from a house holds a perfectly valid session until it
    // expires, which is twelve hours of access after access was withdrawn.
    // Revocation that takes effect "eventually" is not revocation, so the
    // web guard re-checks `seller_staff` on every request. Found by watching a
    // signed-in house keep a working session pointing at a house that no
    // longer existed.
    expect(isSessionValid(session, session.issuedAt + 1_000)).toBe(true);
  });
});
