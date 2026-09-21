/**
 * Identity lookups, on Drizzle.
 *
 * Four narrow reads, and the narrowness is the point. Each takes something the
 * caller already holds — a phone number typed into a sign-in form, or an id
 * lifted from a signed cookie — and answers with an id or a boolean. None of
 * them returns a phone number, an email, or anything else a caller could
 * harvest, so this repository cannot become the route that migration 0026
 * closed by moving contact details off the public seller row.
 *
 * WHAT MAKES THEM SAFE is not this file. It is that every one runs inside a
 * Unit of Work carrying the `identity` service role, whose policies (migration
 * 0027 for the lookups, 0028 for sessions) allow exactly these operations and
 * nothing else — and 0028's trigger means a session it opens can only ever be
 * revoked, never altered. Until task
 * P3.4.1 the same queries ran on the raw connection, which is a superuser —
 * and Postgres never applies row-level security to a superuser, so they were
 * governed by nothing at all.
 */
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type {
  ActiveOperatorSession, ActiveSellerSession, IdentityRepository,
  OperatorPrincipal, SellerPrincipal,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

export const identityRepository = (db: DiyarDatabase): IdentityRepository => ({
  async sellerByContactPhone(phone): Promise<SellerPrincipal | null> {
    /*
     * The join is `seller_staff` → `seller_contacts`, not through `sellers`.
     *
     * The number belongs to the HOUSE (0026) and the session belongs to a
     * staff member, so both tables are needed and the seller row itself is
     * not. Reading one anyway would have meant asking the `identity` role for
     * a grant it has no use for.
     */
    const [row] = await db
      .select({
        sellerId: schema.sellerStaff.sellerId,
        staffAuthUserId: schema.sellerStaff.authUserId,
      })
      .from(schema.sellerStaff)
      .innerJoin(
        schema.sellerContacts,
        eq(schema.sellerContacts.sellerId, schema.sellerStaff.sellerId),
      )
      .where(and(
        eq(schema.sellerContacts.contactPhone, phone),
        isNull(schema.sellerStaff.revokedAt),
      ))
      .limit(1);

    return row ?? null;
  },

  async operatorByPhone(phone): Promise<OperatorPrincipal | null> {
    const [row] = await db
      .select({
        staffId: schema.platformStaff.id,
        authUserId: schema.platformStaff.authUserId,
        fullName: schema.platformStaff.fullName,
      })
      .from(schema.platformStaff)
      .where(and(
        eq(schema.platformStaff.phone, phone),
        isNull(schema.platformStaff.revokedAt),
      ))
      .limit(1);

    return row ?? null;
  },

  async openSession(input) {
    /*
     * `now()` on both ends. The caller says how LONG; the database says WHEN,
     * so a container whose clock has drifted cannot hand out a session that
     * outlives policy — the same reasoning 0025 applies to one-time codes.
     */
    const [row] = await db.insert(schema.sessions).values({
      audience: input.audience,
      principalId: input.principalId,
      sellerId: input.sellerId,
      expiresAt: sql`now() + make_interval(secs => ${input.ttlSeconds})`,
      ipHash: input.ipHash,
      uaHash: input.uaHash,
    }).returning({ id: schema.sessions.id });

    return row!.id;
  },

  async activeSellerSession(sessionId): Promise<ActiveSellerSession | null> {
    /*
     * Three ways a session dies, one query: revoked, expired by the DATABASE'S
     * clock, or the staff member behind it removed. The join to `seller_staff`
     * matches the house as well as the person, so a session cannot outlive the
     * staff member's place in THAT house even if they still work at another.
     */
    const [row] = await db
      .select({
        sessionId: schema.sessions.id,
        sellerId: schema.sessions.sellerId,
        staffAuthUserId: schema.sessions.principalId,
        issuedAt: schema.sessions.issuedAt,
      })
      .from(schema.sessions)
      .innerJoin(schema.sellerStaff, and(
        eq(schema.sellerStaff.authUserId, schema.sessions.principalId),
        eq(schema.sellerStaff.sellerId, schema.sessions.sellerId),
      ))
      .where(and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.audience, 'seller'),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, sql`now()`),
        isNull(schema.sellerStaff.revokedAt),
      ))
      .limit(1);

    if (!row || row.sellerId === null) return null;
    return { ...row, sellerId: row.sellerId };
  },

  async activeOperatorSession(sessionId): Promise<ActiveOperatorSession | null> {
    // The role and name come from the staff row NOW, not from the moment of
    // sign-in: a demotion takes effect on the next click.
    const [row] = await db
      .select({
        sessionId: schema.sessions.id,
        staffId: schema.platformStaff.id,
        authUserId: schema.platformStaff.authUserId,
        fullName: schema.platformStaff.fullName,
        role: schema.platformStaff.role,
        issuedAt: schema.sessions.issuedAt,
      })
      .from(schema.sessions)
      .innerJoin(schema.platformStaff, eq(schema.platformStaff.id, schema.sessions.principalId))
      .where(and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.audience, 'platform'),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, sql`now()`),
        isNull(schema.platformStaff.revokedAt),
      ))
      .limit(1);

    return row ?? null;
  },

  async revokeSession(sessionId) {
    // `revoked_at IS NULL` in the WHERE, not only for idempotence: the trigger
    // in 0028 refuses ANY update to a row that is already revoked, so touching
    // one again would be an error rather than a no-op.
    await db.update(schema.sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt)));
  },

  async revokeAllSessions(audience, principalId) {
    const ended = await db.update(schema.sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(
        eq(schema.sessions.audience, audience),
        eq(schema.sessions.principalId, principalId),
        isNull(schema.sessions.revokedAt),
      ))
      .returning({ id: schema.sessions.id });

    return ended.length;
  },
});
