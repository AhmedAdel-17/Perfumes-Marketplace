/**
 * Drizzle adapter for `ContentImageRepository` — migration 0022.
 *
 * Held to the same contract as the in-memory adapter
 * (`content-image-contract.ts`, run from `repositories.contract.test.ts`).
 */
import { eq, inArray } from 'drizzle-orm';
import type { ContentImage, ContentImageRepository, ImageType } from '@diyar/domain';
import * as schema from './schema';
import type { DiyarDatabase } from './repositories';

type ImageRow = typeof schema.contentImages.$inferSelect;

const toImage = (row: ImageRow): ContentImage => ({
  storageKey: row.storageKey,
  // The column is CHECKed to these three values (0022), so the cast narrows
  // what the database already guarantees rather than trusting the caller.
  contentType: row.contentType as ImageType,
  byteSize: row.byteSize,
  width: row.width,
  height: row.height,
  uploadedBy: row.uploadedBy,
});

export const contentImageRepository = (db: DiyarDatabase): ContentImageRepository => ({
  async record(image) {
    // ON CONFLICT DO NOTHING, then read back: a retried confirm must return the
    // record the FIRST confirm wrote, never overwrite facts read from the bytes.
    await db.insert(schema.contentImages).values({
      storageKey: image.storageKey,
      contentType: image.contentType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      uploadedBy: image.uploadedBy,
    }).onConflictDoNothing({ target: schema.contentImages.storageKey });

    const [row] = await db.select().from(schema.contentImages)
      .where(eq(schema.contentImages.storageKey, image.storageKey))
      .limit(1);
    return toImage(row!);
  },

  async findByKeys(keys) {
    // `IN ()` is a syntax error in Postgres rather than an empty result.
    if (keys.length === 0) return [];
    const rows = await db.select().from(schema.contentImages)
      .where(inArray(schema.contentImages.storageKey, [...new Set(keys)]));
    return rows.map(toImage);
  },
});
