import 'server-only';
import type {
  ActiveOperatorSession, ActiveSellerSession, OpenSession,
  OperatorPrincipal, SellerPrincipal, SessionAudience,
} from '@diyar/domain';
import { unitOfWork } from './db';

/**
 * Who is signing in — the composition root for ADR-10's identity half.
 *
 * WHAT CHANGED HERE (task P3.4.1). The seller and operator consoles resolved a
 * phone to a principal, and revalidated a session on every request, by calling
 * `database()` and writing the SQL in the action file. That handle is a
 * SUPERUSER: Postgres never applies row-level security to one, whatever the
 * policies say and whatever GUC is set. So the four reads that decide WHO YOU
 * ARE were the four no policy governed — which task P1.4.6 demonstrated by
 * accident when sign-in kept working against a table that grants anonymous
 * traffic nothing at all.
 *
 * Every call below runs inside a Unit of Work carrying the `identity` service
 * role, so what sign-in may read is decided by migration 0027 rather than by
 * whoever edits the action next.
 *
 * ONE TRANSACTION PER CALL, not one shared across a request. These are
 * independent single-statement reads with nothing to keep consistent between
 * them, and a transaction held open across an OTP round trip would be a
 * connection held open for as long as somebody takes to read a text message.
 *
 * NOT A tRPC PROCEDURE, deliberately. Putting "which house owns this number" on
 * the public API would publish exactly the enumeration oracle that migration
 * 0026 exists to close. It stays a server-side call with no route to it.
 */

const asIdentity = () => unitOfWork({ role: 'identity', id: null });

export const identity = {
  sellerByContactPhone: (phone: string): Promise<SellerPrincipal | null> =>
    asIdentity().transaction((r) => r.identity.sellerByContactPhone(phone)),

  operatorByPhone: (phone: string): Promise<OperatorPrincipal | null> =>
    asIdentity().transaction((r) => r.identity.operatorByPhone(phone)),

  /* ------------------------------------------ sessions (task P3.4.2, 0028) */

  openSession: (input: OpenSession): Promise<string> =>
    asIdentity().transaction((r) => r.identity.openSession(input)),

  activeSellerSession: (sessionId: string): Promise<ActiveSellerSession | null> =>
    asIdentity().transaction((r) => r.identity.activeSellerSession(sessionId)),

  activeOperatorSession: (sessionId: string): Promise<ActiveOperatorSession | null> =>
    asIdentity().transaction((r) => r.identity.activeOperatorSession(sessionId)),

  revokeSession: (sessionId: string): Promise<void> =>
    asIdentity().transaction((r) => r.identity.revokeSession(sessionId)),

  revokeAllSessions: (audience: SessionAudience, principalId: string): Promise<number> =>
    asIdentity().transaction((r) => r.identity.revokeAllSessions(audience, principalId)),
};
