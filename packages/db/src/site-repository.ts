/**
 * Announcements and homepage curation, on Drizzle.
 */
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { Announcement, Curation, SiteRepository } from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

type Row = typeof schema.announcements.$inferSelect;

const toAnnouncement = (row: Row): Announcement => ({
  id: row.id,
  message: row.message,
  messageEn: row.messageEn,
  href: row.href,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
});

export const siteRepository = (db: DiyarDatabase): SiteRepository => ({
  async allAnnouncements() {
    const rows = await db.select().from(schema.announcements)
      .orderBy(desc(schema.announcements.startsAt));
    return rows.map(toAnnouncement);
  },

  async currentAnnouncements(now) {
    // Half-open, matching the domain: a window ending at noon and one starting
    // at noon must not both be live for the same millisecond.
    const rows = await db.select().from(schema.announcements)
      .where(and(
        lte(schema.announcements.startsAt, now),
        gt(schema.announcements.endsAt, now),
      ))
      .orderBy(desc(schema.announcements.startsAt));
    return rows.map(toAnnouncement);
  },

  async post(input) {
    const [row] = await db.insert(schema.announcements).values(input).returning();
    return toAnnouncement(row!);
  },

  async endAnnouncement(id, at) {
    /*
     * Only one that has already STARTED can be ended.
     *
     * Ending an unstarted announcement would put `ends_at` before `starts_at`
     * and hit the database's ordering CHECK — which would surface as a raw
     * constraint error on a button press. The predicate makes it a no-op that
     * the caller can report properly instead.
     */
    const result = await db.update(schema.announcements)
      .set({ endsAt: at })
      .where(and(
        eq(schema.announcements.id, id),
        lte(schema.announcements.startsAt, at),
        gt(schema.announcements.endsAt, at),
      ))
      .returning({ id: schema.announcements.id });
    return result.length > 0;
  },

  async curation() {
    const [row] = await db.select().from(schema.siteCuration).limit(1);
    // The row is inserted by the migration, so this is a read and never a
    // read-or-create. The fallback exists for a database built some other way,
    // and gives the behaviour the site had before curation existed.
    return {
      heroProductId: row?.heroProductId ?? null,
      featuredProductIds: row?.featuredProductIds ?? [],
    };
  },

  async setCuration({ heroProductId, featuredProductIds, updatedBy }) {
    await db.update(schema.siteCuration).set({
      heroProductId,
      featuredProductIds: [...featuredProductIds],
      updatedBy,
      updatedAt: new Date(),
    }).where(eq(schema.siteCuration.singleton, true));
  },
});
