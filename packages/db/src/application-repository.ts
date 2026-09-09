/**
 * Seller applications, on Drizzle.
 *
 * The one thing worth reading here is `apply`: it inserts with
 * `status = 'applied'` and nothing else, which is not politeness — migration
 * 0018's WITH CHECK refuses any other value from the `intake` role, so this
 * path cannot create a live house even if this file were wrong.
 */
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import {
  type ApplicationRecord, type ApplicationRepository,
  type VerificationControl, type VerificationRecord, type VerificationStatus,
} from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

/** Everything that is not yet trading and has not been turned away. */
const IN_INTAKE = ['applied', 'under_review', 'approved'] as const;

export const applicationRepository = (db: DiyarDatabase): ApplicationRepository => ({
  async apply(input) {
    /*
     * The slug is checked by the unique index, not by a prior SELECT.
     *
     * A read-then-insert has a gap in it, and two houses submitting the same
     * wordmark within the same second is exactly the kind of thing that
     * happens once and is then impossible to reproduce. `ON CONFLICT DO
     * NOTHING` closes it: the second insert affects no rows and the applicant
     * is told the address is taken.
     */
    const inserted = await db.insert(schema.sellers)
      .values({
        tradingName: input.tradingName.trim(),
        slug: input.slug,
        ownerName: input.ownerName.trim(),
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail?.trim() || null,
        city: input.city.trim(),
        applicationNote: input.note.trim(),
        appliedAt: input.now,
        // Stated explicitly rather than left to the column default, because it
        // is the value migration 0018's policy checks. A default that changed
        // would change what this path can create.
        status: 'applied',
      })
      .onConflictDoNothing({ target: schema.sellers.slug })
      .returning({ id: schema.sellers.id, slug: schema.sellers.slug });

    const row = inserted[0];
    return row ? { id: row.id, slug: row.slug } : null;
  },

  async listApplications() {
    /*
     * The checklist count comes back with the row, in one query.
     *
     * "6 of 8" is the number an operator triages on, and asking for it per row
     * would be an N+1 on a screen whose whole purpose is a list.
     */
    const rows = await db
      .select({
        id: schema.sellers.id,
        tradingName: schema.sellers.tradingName,
        slug: schema.sellers.slug,
        ownerName: schema.sellers.ownerName,
        contactPhone: schema.sellers.contactPhone,
        contactEmail: schema.sellers.contactEmail,
        city: schema.sellers.city,
        status: schema.sellers.status,
        applicationNote: schema.sellers.applicationNote,
        appliedAt: schema.sellers.appliedAt,
        approvedControls: sql<number>`
          (SELECT count(*)::int FROM seller_verifications v
            WHERE v.seller_id = ${schema.sellers.id} AND v.status = 'approved')
        `,
      })
      .from(schema.sellers)
      .where(inArray(schema.sellers.status, [...IN_INTAKE]))
      // Oldest first. An applicant who has been waiting three weeks is the one
      // most likely to give up, and a list sorted newest-first hides them.
      .orderBy(asc(schema.sellers.appliedAt), asc(schema.sellers.createdAt));

    return rows.map((r): ApplicationRecord => ({ ...r, approvedControls: Number(r.approvedControls) }));
  },

  async findApplication(id) {
    const [row] = await db
      .select({
        id: schema.sellers.id,
        tradingName: schema.sellers.tradingName,
        slug: schema.sellers.slug,
        ownerName: schema.sellers.ownerName,
        contactPhone: schema.sellers.contactPhone,
        contactEmail: schema.sellers.contactEmail,
        city: schema.sellers.city,
        status: schema.sellers.status,
        applicationNote: schema.sellers.applicationNote,
        appliedAt: schema.sellers.appliedAt,
      })
      .from(schema.sellers)
      .where(eq(schema.sellers.id, id))
      .limit(1);

    if (!row) return null;

    const [tally] = await db
      .select({ n: count() })
      .from(schema.sellerVerifications)
      .where(and(
        eq(schema.sellerVerifications.sellerId, id),
        eq(schema.sellerVerifications.status, 'approved'),
      ));

    return { ...row, approvedControls: tally?.n ?? 0 };
  },

  async verifications(sellerId) {
    const rows = await db
      .select({
        control: schema.sellerVerifications.control,
        status: schema.sellerVerifications.status,
        notes: schema.sellerVerifications.notes,
        reviewedAt: schema.sellerVerifications.reviewedAt,
      })
      .from(schema.sellerVerifications)
      .where(eq(schema.sellerVerifications.sellerId, sellerId))
      .orderBy(asc(schema.sellerVerifications.control));

    return rows.map((r): VerificationRecord => ({
      control: r.control as VerificationControl,
      status: r.status as VerificationStatus,
      notes: r.notes,
      reviewedAt: r.reviewedAt,
    }));
  },

  async setVerification({ sellerId, control, status, notes, reviewedBy, now }) {
    const updated = await db.update(schema.sellerVerifications)
      .set({ status, notes, reviewedBy, reviewedAt: now })
      .where(and(
        eq(schema.sellerVerifications.sellerId, sellerId),
        eq(schema.sellerVerifications.control, control),
      ))
      .returning({ id: schema.sellerVerifications.id });

    return updated.length > 0;
  },

  async setStatus({ id, status, now }) {
    const updated = await db.update(schema.sellers)
      .set({
        status,
        updatedAt: now,
        // The timestamps that say WHEN, kept beside the status rather than
        // inferred from an audit entry later.
        ...(status === 'approved' ? { approvedAt: now } : {}),
        ...(status === 'live' ? { liveAt: now } : {}),
        ...(status === 'suspended' ? { suspendedAt: now } : {}),
      })
      .where(eq(schema.sellers.id, id))
      .returning({ id: schema.sellers.id });

    return updated.length > 0;
  },
});
