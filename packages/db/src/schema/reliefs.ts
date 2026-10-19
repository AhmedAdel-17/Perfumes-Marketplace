/**
 * A photograph's relief — its bottle lifted out of it (migration 0032).
 *
 * A file of its own rather than a section of `catalogue.ts`: the row names the
 * operator who made it, and `governance` (where `platform_staff` lives) already
 * reaches the catalogue through `orders`, so the catalogue reaching back would
 * close a cycle.
 */
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { productMedia } from './catalogue';
import { platformStaff } from './governance';

export const productMediaReliefs = pgTable('product_media_reliefs', {
  mediaId: uuid('media_id').primaryKey().references(() => productMedia.id, { onDelete: 'cascade' }),
  cutoutKey: text('cutout_key').notNull(),
  reliefKey: text('relief_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  cutoutBytes: integer('cutout_bytes').notNull(),
  reliefBytes: integer('relief_bytes').notNull(),
  /** Millionths of the photograph's width / height; the turn in hundredths of a degree. */
  centreXPpm: integer('centre_x_ppm').notNull(),
  centreYPpm: integer('centre_y_ppm').notNull(),
  heightPpm: integer('height_ppm').notNull(),
  angleCentidegrees: integer('angle_centidegrees').notNull(),
  method: text('method').notNull(),
  opaque: boolean('opaque').notNull(),
  madeBy: uuid('made_by').notNull().references(() => platformStaff.id),
  madeAt: timestamp('made_at', { withTimezone: true }).defaultNow().notNull(),
});
