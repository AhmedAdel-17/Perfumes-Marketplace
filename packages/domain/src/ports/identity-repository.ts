/**
 * Who is signing in, and are they still allowed to be.
 *
 * WHY THIS EXISTS (ADR-10, task P3.4.1). Sign-in and session revalidation
 * queried Postgres straight from `apps/web`, through a connection that is a
 * SUPERUSER — and Postgres never applies row-level security to a superuser,
 * whatever the policies say and whatever GUC is set. So the three reads that
 * decide who you are were the three reads no policy governed. Task P1.4.6 found
 * this while moving a house's phone number off the public row: sign-in kept
 * working against a table that grants anonymous traffic nothing at all, which
 * is only possible if nothing was being enforced.
 *
 * Behind this port they run inside a Unit of Work as the `identity` service
 * role (migration 0025 named it; 0027 gives it the three policies it needs), so
 * what sign-in may read is decided by the database and is the same three rows
 * whatever the calling code does next.
 *
 * WHAT `identity` MAY DO, and it is deliberately almost nothing: resolve a
 * phone to a house, resolve a phone to an operator, and open, read and revoke
 * sessions (migration 0028). It may not read a house's catalogue, an
 * order, or any other operator's row. It is set only inside a sign-in
 * transaction on the server and is reachable from a browser exactly never.
 *
 * THE PHONE IS AN INPUT, NEVER AN OUTPUT. Every method takes a number the
 * caller already has and answers with an id. None of them returns a contact
 * detail, so this port cannot become the enumeration route that moving the
 * column off `sellers` was meant to close.
 */

/** The house behind a phone number, and the staff member who answered it. */
export interface SellerPrincipal {
  readonly sellerId: string;
  readonly staffAuthUserId: string;
}

/** The operator behind a phone number. The name is captured for the audit trail. */
export interface OperatorPrincipal {
  readonly staffId: string;
  readonly authUserId: string;
  readonly fullName: string;
}

/** Which console a session opens. A house's session never opens `/ops`. */
export type SessionAudience = 'seller' | 'platform';

/**
 * What it takes to open a session (task P3.4.2).
 *
 * `ttlSeconds`, not an expiry moment: the database stamps both ends with its
 * own clock, so a container whose clock has drifted cannot hand out a session
 * that lives longer than policy says. The hashes are KEYED hashes computed by
 * the caller, never raw values — see migration 0028.
 */
export interface OpenSession {
  readonly audience: SessionAudience;
  /** Staff `auth_user_id` for a house; `platform_staff.id` for an operator. */
  readonly principalId: string;
  /** The house, for a seller session. Null for an operator. */
  readonly sellerId: string | null;
  readonly ttlSeconds: number;
  readonly ipHash: string | null;
  readonly uaHash: string | null;
}

/** A house's session, as it stands right now. */
export interface ActiveSellerSession {
  readonly sessionId: string;
  readonly sellerId: string;
  readonly staffAuthUserId: string;
  readonly issuedAt: Date;
}

/**
 * An operator's session, as it stands right now — with the CURRENT role and
 * name, not the ones they had when they signed in.
 */
export interface ActiveOperatorSession {
  readonly sessionId: string;
  readonly staffId: string;
  readonly authUserId: string;
  readonly fullName: string;
  readonly role: string;
  readonly issuedAt: Date;
}

export interface IdentityRepository {
  /**
   * The house whose contact number this is, if any staff member is still active.
   *
   * One answer or none. A number that belongs to no house and a number whose
   * staff have all been revoked are the same answer on purpose — the sign-in
   * screen says the same thing either way, and a caller that could tell them
   * apart would be an oracle for which numbers are worth attacking.
   */
  sellerByContactPhone(phone: string): Promise<SellerPrincipal | null>;

  /** The operator whose number this is, if they have not been revoked. */
  operatorByPhone(phone: string): Promise<OperatorPrincipal | null>;

  /* ------------------------------------------------------------ sessions */

  /**
   * Open a session and return its id — the only thing the cookie will carry.
   */
  openSession(input: OpenSession): Promise<string>;

  /**
   * The house behind this session, if it is still good.
   *
   * ONE query answers all three ways a session dies: it was revoked, it
   * expired by the database's clock, or the staff member behind it was
   * removed. Asked on every request that carries a seller cookie, so revoking
   * anything takes effect on the next click rather than when a cookie happens
   * to expire. This REPLACES the separate staff lookup that preceded it.
   */
  activeSellerSession(sessionId: string): Promise<ActiveSellerSession | null>;

  /**
   * The operator behind this session, if it is still good, with their CURRENT
   * role. For a console that releases money, "what may this person do" is not
   * a question to answer from a token issued hours ago.
   */
  activeOperatorSession(sessionId: string): Promise<ActiveOperatorSession | null>;

  /**
   * End one session. Idempotent: ending an already-ended session is not an
   * error, because a person pressing "sign out" twice has done nothing wrong.
   */
  revokeSession(sessionId: string): Promise<void>;

  /**
   * End every open session this person has in one console, and say how many.
   *
   * "Sign me out everywhere" is the only honest answer to "I lost my phone",
   * and until 0028 it could not be expressed at all.
   */
  revokeAllSessions(audience: SessionAudience, principalId: string): Promise<number>;
}
