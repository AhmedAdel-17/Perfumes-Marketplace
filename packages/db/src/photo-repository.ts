/**
 * A product's photographs, on Drizzle.
 *
 * Every write names the photograph AND its product, so an id from another
 * product matches nothing — and runs inside the same Unit of Work as the rest of
 * the request, so row-level security (`seller_manage_own_media`) applies too.
 *
 * The two uniqueness rules the port promises — one primary, the first photograph
 * primary — are held here by ordering and by the database, not by hope:
 * `product_media_one_primary` (0021) turns a second primary into an error, so
 * the writes below always clear the old primary BEFORE setting a new one.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ImageType, PhotoRepository, StoredPhoto } from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

type Row = typeof schema.productMedia.$inferSelect;

const toPhoto = (row: Row): StoredPhoto => ({
  id: row.id,
  productId: row.productId,
  storageKey: row.storagePath,
  alt: row.altText,
  position: row.position,
  isPrimary: row.isPrimary,
  ownershipConfirmed: row.ownershipConfirmed,
  contentType: row.contentType as ImageType | null,
  byteSize: row.byteSize,
  width: row.width,
  height: row.height,
});

const onProduct = (photoId: string, productId: string) => and(
  eq(schema.productMedia.id, photoId),
  eq(schema.productMedia.productId, productId),
);

export const photoRepository = (db: DiyarDatabase): PhotoRepository => ({
  async listForProduct(productId) {
    const rows = await db.select().from(schema.productMedia)
      .where(eq(schema.productMedia.productId, productId))
      // `created_at` breaks position ties, which concurrent uploads can create;
      // an order that changed between two reads would move photographs around
      // under a house that had not touched them.
      .orderBy(asc(schema.productMedia.position), asc(schema.productMedia.createdAt), asc(schema.productMedia.id));
    return rows.map(toPhoto);
  },

  async add(productId, photo) {
    const [state] = await db
      .select({
        next: sql<number>`coalesce(max(${schema.productMedia.position}) + 1, 0)::int`,
        hasPrimary: sql<boolean>`coalesce(bool_or(${schema.productMedia.isPrimary}), false)`,
      })
      .from(schema.productMedia)
      .where(eq(schema.productMedia.productId, productId));

    const [row] = await db.insert(schema.productMedia).values({
      productId,
      storagePath: photo.storageKey,
      altText: photo.alt.trim(),
      ownershipConfirmed: photo.ownershipConfirmed,
      position: state?.next ?? 0,
      // Two uploads finishing at the same moment can both see "no primary"; the
      // partial unique index refuses the second, and that request fails rather
      // than leaving a product with two.
      isPrimary: !(state?.hasPrimary ?? false),
      contentType: photo.contentType,
      byteSize: photo.byteSize,
      width: photo.width,
      height: photo.height,
    }).returning();

    return toPhoto(row!);
  },

  async describe(photoId, productId, input) {
    const rows = await db.update(schema.productMedia)
      .set({ altText: input.alt.trim(), ownershipConfirmed: input.ownershipConfirmed })
      .where(onProduct(photoId, productId))
      .returning({ id: schema.productMedia.id });
    return rows.length > 0;
  },

  async makePrimary(photoId, productId) {
    const [target] = await db.select({ id: schema.productMedia.id })
      .from(schema.productMedia).where(onProduct(photoId, productId)).limit(1);
    if (!target) return false;

    // Clear first, then set — the other order violates the one-primary index
    // for the instant between the two statements.
    await db.update(schema.productMedia)
      .set({ isPrimary: false })
      .where(and(eq(schema.productMedia.productId, productId), eq(schema.productMedia.isPrimary, true)));
    await db.update(schema.productMedia)
      .set({ isPrimary: true })
      .where(onProduct(photoId, productId));
    return true;
  },

  async reorder(productId, orderedIds) {
    for (const [position, id] of orderedIds.entries()) {
      await db.update(schema.productMedia)
        .set({ position })
        .where(onProduct(id, productId));
    }
  },

  async remove(photoId, productId) {
    const [removed] = await db.delete(schema.productMedia)
      .where(onProduct(photoId, productId))
      .returning();
    if (!removed) return null;

    if (removed.isPrimary) {
      const [next] = await db.select({ id: schema.productMedia.id })
        .from(schema.productMedia)
        .where(eq(schema.productMedia.productId, productId))
        .orderBy(asc(schema.productMedia.position), asc(schema.productMedia.createdAt), asc(schema.productMedia.id))
        .limit(1);
      if (next) {
        await db.update(schema.productMedia)
          .set({ isPrimary: true })
          .where(eq(schema.productMedia.id, next.id));
      }
    }

    return toPhoto(removed);
  },
});
