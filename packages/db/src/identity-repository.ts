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
 * Unit of Work carrying the `identity` service role, whose three policies
 * (migration 0027) allow exactly these reads and nothing else. Until task
 * P3.4.1 the same queries ran on the raw connection, which is a superuser —
 * and Postgres never applies row-level security to a superuser, so they were
 * governed by nothing at all.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type {
  ActiveOperator, IdentityRepository, OperatorPrincipal, SellerPrincipal,
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

  async sellerStaffIsActive(sellerId, staffAuthUserId) {
    const [row] = await db
      .select({ id: schema.sellerStaff.id })
      .from(schema.sellerStaff)
      .where(and(
        eq(schema.sellerStaff.sellerId, sellerId),
        eq(schema.sellerStaff.authUserId, staffAuthUserId),
        isNull(schema.sellerStaff.revokedAt),
      ))
      .limit(1);

    return row !== undefined;
  },

  async activeOperator(staffId): Promise<ActiveOperator | null> {
    // The role comes back with the id, because it is read at the same moment
    // and for the same reason: what this operator may do is a fact about the
    // CURRENT row, not about the cookie they signed in with.
    const [row] = await db
      .select({ staffId: schema.platformStaff.id, role: schema.platformStaff.role })
      .from(schema.platformStaff)
      .where(and(
        eq(schema.platformStaff.id, staffId),
        isNull(schema.platformStaff.revokedAt),
      ))
      .limit(1);

    return row ?? null;
  },
});
