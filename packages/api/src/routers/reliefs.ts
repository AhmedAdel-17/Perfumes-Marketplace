import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  RELIEF_LIMITS, RELIEF_METHODS, objectionsToReliefPlacement, reliefMediaKey,
  type ReliefMethod, type ReliefOverviewRow, type StoredRelief, type UnitOfWork,
} from '@diyar/domain';
import { assertMediaKey, type MediaStore } from '../providers/media';
import { refuseImage, verifyArrivedImage } from '../image-verification';
import { consume, rateLimitMessage } from '../rate-limit';
import { platformProcedure, router } from '../trpc';

/**
 * Reliefs — a perfume's bottle lifted out of its photograph, for the reveal on
 * its product page (Le Dévoilement; founder, 18–19 Oct 2026; migration 0032).
 *
 * Made by the platform's content team in the console, never by a house
 * (founder, 19 Oct 2026). The making itself happens in the operator's browser
 * — `makeRelief` in the domain, run on the photograph's pixels — so this
 * router does the part a browser cannot be trusted with:
 *
 *   startUpload — the photograph must be the product's verified primary; two
 *                 PUT URLs are signed, under RANDOM keys in `reliefs/<product>/`,
 *                 for the cut-out and the relief map, both PNG.
 *   confirm     — both keys must be ones issued for THIS product; the bytes
 *                 that arrived are read (each a PNG, within the relief limits,
 *                 the two the same size); the placement must be one the
 *                 pipeline could have made. Then the row is written, the
 *                 decision audited, and any relief it replaced has its files
 *                 removed.
 *   remove      — the row goes, audited; then its files.
 *
 * Pattern — Facade (ENGINEERING_PRINCIPLES §4): validate, authorise, call the
 * repository, map the result. The rules are the domain's.
 */

const UPLOAD_SECONDS = 600;

const placementSchema = z.object({
  centreX: z.number().finite(),
  centreY: z.number().finite(),
  height: z.number().finite(),
  angle: z.number().finite(),
});

function staffOrThrow(ctx: { platformStaffId: string | null }): string {
  if (!ctx.platformStaffId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
  return ctx.platformStaffId;
}

const reliefOut = (relief: StoredRelief, media: MediaStore) => ({
  cutoutUrl: media.publicUrl(relief.cutoutKey),
  reliefUrl: media.publicUrl(relief.reliefKey),
  width: relief.width,
  height: relief.height,
  placement: relief.placement,
  method: relief.method,
  opaque: relief.opaque,
  madeAt: relief.madeAt.toISOString(),
});

const rowOut = (row: ReliefOverviewRow, media: MediaStore) => ({
  productId: row.productId,
  slug: row.slug,
  name: row.name,
  brandName: row.brandName,
  status: row.status,
  mediaId: row.mediaId,
  photoUrl: media.publicUrl(row.photoKey),
  photoWidth: row.photoWidth,
  photoHeight: row.photoHeight,
  relief: row.relief ? reliefOut(row.relief, media) : null,
});

/** The product's verified primary photograph — the only one a relief is made from. */
async function primaryOf(ctx: { readonly uow: UnitOfWork }, productId: string, mediaId: string) {
  const [row] = await ctx.uow.transaction((r) => r.reliefs.overview(productId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود أو بلا صورة رئيسية موثّقة.' });
  if (row.mediaId !== mediaId) {
    throw new TRPCError({ code: 'CONFLICT', message: 'تغيّرت الصورة الرئيسية لهذا المنتج. حدّث الصفحة.' });
  }
  return row;
}

const isOwnKey = (key: string, productId: string) => {
  try {
    assertMediaKey(key);
  } catch {
    return false;
  }
  return key.startsWith(`reliefs/${productId}/`) && key.endsWith('.png');
};

/** Files go AFTER their row, outside the transaction: a file with no row shows nobody anything. */
const removeFiles = (media: MediaStore, relief: StoredRelief | null) => (relief
  ? Promise.all([media.remove(relief.cutoutKey), media.remove(relief.reliefKey)]).then(() => undefined, () => undefined)
  : Promise.resolve());

export const reliefsRouter = router({
  /** The console's work list: every product with a verified primary photograph. */
  list: platformProcedure
    .input(z.object({ productId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.uow.transaction((r) => r.reliefs.overview(input?.productId));
      return rows.map((row) => rowOut(row, ctx.media));
    }),

  startUpload: platformProcedure
    .input(z.object({ productId: z.string().uuid(), mediaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const staffId = staffOrThrow(ctx);
      const verdict = consume('upload', `staff:${staffId}`);
      if (!verdict.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rateLimitMessage(verdict.retryAfterSeconds) });
      }
      await primaryOf(ctx, input.productId, input.mediaId);

      const sign = async () => {
        const key = reliefMediaKey(input.productId, (count) => crypto.getRandomValues(new Uint8Array(count)));
        const upload = await ctx.media.presignUpload({
          key, contentType: 'image/png', expiresInSeconds: UPLOAD_SECONDS, now: ctx.clock.now(),
        });
        return { key, url: upload.url, method: upload.method, headers: upload.headers, expiresAt: upload.expiresAt.toISOString() };
      };
      return { cutout: await sign(), relief: await sign() };
    }),

  confirm: platformProcedure
    .input(z.object({
      productId: z.string().uuid(),
      mediaId: z.string().uuid(),
      cutoutKey: z.string().min(1).max(200),
      reliefKey: z.string().min(1).max(200),
      placement: placementSchema,
      method: z.enum(RELIEF_METHODS as unknown as [ReliefMethod, ...ReliefMethod[]]),
      opaque: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const staffId = staffOrThrow(ctx);

      // Keys WE issued, for THIS product, and two different files.
      if (!isOwnKey(input.cutoutKey, input.productId) || !isOwnKey(input.reliefKey, input.productId)
        || input.cutoutKey === input.reliefKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'روابط ملفات العرض المجسّم غير صالحة.' });
      }
      if (objectionsToReliefPlacement(input.placement).length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'موضع الزجاجة في الصورة غير صالح. أعد صنع العرض المجسّم.' });
      }
      const product = await primaryOf(ctx, input.productId, input.mediaId);

      // The bytes decide. A file that fails is removed by the check itself.
      const limits = { maxBytes: RELIEF_LIMITS.maxBytes, minEdge: RELIEF_LIMITS.minEdge, maxEdge: RELIEF_LIMITS.maxEdge };
      const cutout = await verifyArrivedImage(ctx.media, input.cutoutKey, 'image/png', limits);
      const map = await verifyArrivedImage(ctx.media, input.reliefKey, 'image/png', limits);
      if (cutout.width !== map.width || cutout.height !== map.height) {
        await removeFiles(ctx.media, { cutoutKey: input.cutoutKey, reliefKey: input.reliefKey } as StoredRelief);
        throw refuseImage(['type_mismatch']);
      }

      const { replaced, saved } = await ctx.uow.transaction(async (r) => {
        const previous = await r.reliefs.put({
          mediaId: input.mediaId,
          cutoutKey: input.cutoutKey,
          reliefKey: input.reliefKey,
          width: cutout.width,
          height: cutout.height,
          cutoutBytes: cutout.byteSize,
          reliefBytes: map.byteSize,
          placement: input.placement,
          method: input.method,
          opaque: input.opaque,
          madeBy: staffId,
        });
        await r.audit.record({
          action: 'listing_moderation',
          actorId: staffId,
          actorLabel: ctx.platformLabel ?? 'platform',
          entityTable: 'product_media_reliefs',
          entityId: input.mediaId,
          before: previous === null ? null : JSON.stringify({ product: product.slug, method: previous.method, opaque: previous.opaque }),
          after: JSON.stringify({ product: product.slug, method: input.method, opaque: input.opaque }),
        });
        return { replaced: previous, saved: await r.reliefs.forPhoto(input.mediaId) };
      });

      // A re-confirm of the same files replaces nothing worth deleting.
      if (replaced && replaced.cutoutKey !== input.cutoutKey) await removeFiles(ctx.media, replaced);
      return reliefOut(saved!, ctx.media);
    }),

  remove: platformProcedure
    .input(z.object({ productId: z.string().uuid(), mediaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const staffId = staffOrThrow(ctx);
      const product = await primaryOf(ctx, input.productId, input.mediaId);
      const removed = await ctx.uow.transaction(async (r) => {
        const gone = await r.reliefs.remove(input.mediaId);
        if (gone) {
          await r.audit.record({
            action: 'listing_moderation',
            actorId: staffId,
            actorLabel: ctx.platformLabel ?? 'platform',
            entityTable: 'product_media_reliefs',
            entityId: input.mediaId,
            before: JSON.stringify({ product: product.slug, method: gone.method, opaque: gone.opaque }),
            after: null,
          });
        }
        return gone;
      });
      await removeFiles(ctx.media, removed);
      return { removed: removed !== null };
    }),
});
