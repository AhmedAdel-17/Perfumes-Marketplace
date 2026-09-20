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
 * phone to a house, resolve a phone to an operator, and answer whether a
 * session's subject is still active. It may not read a house's catalogue, an
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

/** An operator as they are RIGHT NOW, which is not what their cookie says. */
export interface ActiveOperator {
  readonly staffId: string;
  readonly role: string;
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

  /**
   * Is this staff member still working for this house?
   *
   * Asked on every request that carries a seller cookie. The cookie is signed
   * and valid for twelve hours, so without this a revoked staff member keeps
   * their access until it expires — and the symptom of getting it wrong is not
   * an error, it is a house seeing an empty queue with no explanation.
   */
  sellerStaffIsActive(sellerId: string, staffAuthUserId: string): Promise<boolean>;

  /**
   * The operator's CURRENT row, or null if they have been revoked.
   *
   * The role comes back with the id because it is a fact about the row now, not
   * about the cookie they signed in with. For a console that releases money,
   * "what may this person do" is not a question to answer from a token issued
   * hours ago.
   */
  activeOperator(staffId: string): Promise<ActiveOperator | null>;
}
