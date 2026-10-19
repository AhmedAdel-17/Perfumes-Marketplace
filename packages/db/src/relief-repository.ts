/**
 * A photograph's relief, on Drizzle (migration 0032).
 *
 * Every write runs inside the caller's Unit of Work, so row security decides
 * who may make one: `platform_manage_reliefs` lets the platform, and nothing
 * lets a house or a visitor — a write from either affects no row, or is
 * refused, never quietly accepted.
 */
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { NewRelief, ReliefMethod, ReliefOverviewRow, ReliefRepository, StoredRelief } from '@diyar/domain';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

type Row = typeof schema.productMediaReliefs.$inferSelect;

// The placement is stored as integers (0032): millionths, and hundredths of a degree.
const PPM = 1_000_000;
const CENTI = 100;

const toRelief = (row: Row): StoredRelief => ({
  mediaId: row.mediaId,
  cutoutKey: row.cutoutKey,
  reliefKey: row.reliefKey,
  width: row.width,
  height: row.height,
  cutoutBytes: row.cutoutBytes,
  reliefBytes: row.reliefBytes,
  placement: {
    centreX: row.centreXPpm / PPM,
    centreY: row.centreYPpm / PPM,
    height: row.heightPpm / PPM,
    angle: row.angleCentidegrees / CENTI,
  },
  method: row.method as ReliefMethod,
  opaque: row.opaque,
  madeBy: row.madeBy,
  madeAt: row.madeAt,
});

const values = (r: NewRelief) => ({
  mediaId: r.mediaId,
  cutoutKey: r.cutoutKey,
  reliefKey: r.reliefKey,
  width: r.width,
  height: r.height,
  cutoutBytes: r.cutoutBytes,
  reliefBytes: r.reliefBytes,
  centreXPpm: Math.round(r.placement.centreX * PPM),
  centreYPpm: Math.round(r.placement.centreY * PPM),
  heightPpm: Math.round(r.placement.height * PPM),
  angleCentidegrees: Math.round(r.placement.angle * CENTI),
  method: r.method,
  opaque: r.opaque,
  madeBy: r.madeBy,
});

export const reliefRepository = (db: DiyarDatabase): ReliefRepository => ({
  async overview(productId) {
    const m = schema.productMedia, p = schema.products, b = schema.brands, rl = schema.productMediaReliefs;
    const rows = await db
      .select({
        productId: p.id, slug: p.slug, name: p.name, brandName: b.name, status: p.status,
        mediaId: m.id, photoKey: m.storagePath, photoWidth: m.width, photoHeight: m.height,
        relief: rl,
      })
      .from(m)
      .innerJoin(p, eq(p.id, m.productId))
      .innerJoin(b, eq(b.id, p.brandId))
      .leftJoin(rl, eq(rl.mediaId, m.id))
      // Only a VERIFIED primary photograph (0021): a row with no facts has no
      // file behind it, and there is nothing to lift a bottle out of.
      .where(and(
        eq(m.isPrimary, true),
        isNotNull(m.contentType),
        productId ? eq(p.id, productId) : undefined,
      ))
      .orderBy(asc(p.name));

    return rows
      .map((row): ReliefOverviewRow => ({
        productId: row.productId,
        slug: row.slug,
        name: row.name,
        brandName: row.brandName,
        status: row.status,
        mediaId: row.mediaId,
        photoKey: row.photoKey,
        photoWidth: row.photoWidth!,
        photoHeight: row.photoHeight!,
        relief: row.relief ? toRelief(row.relief) : null,
      }))
      // The work first: products still waiting for a relief.
      .sort((a, z) => Number(a.relief !== null) - Number(z.relief !== null));
  },

  async forPhoto(mediaId) {
    const [row] = await db.select().from(schema.productMediaReliefs)
      .where(eq(schema.productMediaReliefs.mediaId, mediaId)).limit(1);
    return row ? toRelief(row) : null;
  },

  async put(relief) {
    const [previous] = await db.select().from(schema.productMediaReliefs)
      .where(eq(schema.productMediaReliefs.mediaId, relief.mediaId)).limit(1);
    await db.insert(schema.productMediaReliefs)
      .values(values(relief))
      .onConflictDoUpdate({
        target: schema.productMediaReliefs.mediaId,
        // A new relief is a new decision: it is dated now, by whoever made it.
        set: { ...values(relief), madeAt: new Date() },
      });
    return previous ? toRelief(previous) : null;
  },

  async remove(mediaId) {
    const [removed] = await db.delete(schema.productMediaReliefs)
      .where(eq(schema.productMediaReliefs.mediaId, mediaId))
      .returning();
    return removed ? toRelief(removed) : null;
  },
});
