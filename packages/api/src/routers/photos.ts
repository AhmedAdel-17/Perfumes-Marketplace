import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  IMAGE_TYPES, MEDIA_LIMITS, isListingEditableBySeller, objectionsToAddingPhoto, objectionsToDescribing,
  objectionsToRemovingPhoto, productMediaKey, reorderedPhotos,
  type ImageObjection, type PhotoObjection, type Repositories, type StoredPhoto,
} from '@diyar/domain';
import { IMAGE_OBJECTION_AR, PHOTO_OBJECTION_AR } from '@diyar/i18n';
import { declaredTypeOf, verifyArrivedImage } from '../image-verification';
import { assertMediaKey, type MediaStore } from '../providers/media';
import { consume, rateLimitMessage } from '../rate-limit';
import { router, sellerProcedure } from '../trpc';

/**
 * A house adding photographs to its own listings — WORK_PLAN 5.7.3.
 *
 * THE FLOW, in the order it runs:
 *
 *   startUpload — the house asks for somewhere to put a file. We check the
 *                 listing is theirs, that it has room, and that the declared type
 *                 and size are acceptable; then sign a short-lived PUT URL under
 *                 a RANDOM key we chose.
 *   (browser)   — the file goes straight to storage. Nothing about it is known.
 *   confirm     — we look at what ARRIVED: its size, the type storage recorded,
 *                 and the first bytes of the file itself. Only a file that is
 *                 what it claims, large enough and small enough becomes a
 *                 `product_media` row.
 *
 * A file that fails the FILE checks is deleted — it can never become a
 * photograph. A file that passes them but arrives with a blank description is
 * kept, because the house can fix the description and confirm again without
 * uploading 6 MB twice.
 *
 * Every procedure re-reads the listing through `findForSeller` inside the
 * transaction. That, and row-level security behind it, is the wall between
 * houses — never a product id the browser sent.
 */

const UPLOAD_SECONDS = 600;

const idSchema = z.string().min(1).max(64);

function houseOrThrow(ctx: { sellerId: string | null }): string {
  if (!ctx.sellerId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
  return ctx.sellerId;
}

async function ownedListing(r: Repositories, productId: string, sellerId: string) {
  const listing = await r.listings.findForSeller(productId, sellerId);
  // Not found and not yours are the same answer, as everywhere a house asks.
  if (!listing) throw new TRPCError({ code: 'NOT_FOUND', message: 'المنتج غير موجود' });
  return listing;
}

/**
 * A listing its house may CHANGE right now.
 *
 * Every write goes through this, not only the screen: the photograph manager
 * hides its controls on a locked listing, and without the same rule here a
 * house could still change, through the API, a listing a moderator is reading.
 */
async function editableListing(r: Repositories, productId: string, sellerId: string) {
  const listing = await ownedListing(r, productId, sellerId);
  if (!isListingEditableBySeller(listing.state)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: listing.state === 'pending_moderation'
        ? 'المنتج قيد المراجعة. اسحبه من المراجعة إذا أردت تعديل صوره.'
        : 'المنتج مؤرشف، ولا يمكن تعديل صوره.',
    });
  }
  return listing;
}

/** Every objection, as the sentences a house reads — each once, file problems first. */
function refuse(image: readonly ImageObjection[], photo: readonly PhotoObjection[] = []): TRPCError {
  const sentences: string[] = [
    ...[...new Set(image)].map((o) => IMAGE_OBJECTION_AR[o]),
    ...[...new Set(photo)].map((o) => PHOTO_OBJECTION_AR[o]),
  ];
  return new TRPCError({ code: 'BAD_REQUEST', message: sentences.join(' ') });
}

/**
 * A photograph as the console sees it.
 *
 * The URL is present only for a VERIFIED row. A row written before the upload
 * flow existed has a path with no file behind it, and handing the console a URL
 * for it would draw a broken image in the house's own editor.
 */
const photoOut = (photo: StoredPhoto, media: MediaStore) => ({
  id: photo.id,
  alt: photo.alt,
  position: photo.position,
  isPrimary: photo.isPrimary,
  ownershipConfirmed: photo.ownershipConfirmed,
  width: photo.width,
  height: photo.height,
  url: photo.contentType === null ? null : media.publicUrl(photo.storageKey),
});

export const photosRouter = router({
  list: sellerProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);
      const photos = await ctx.uow.transaction(async (r) => {
        await ownedListing(r, input.productId, sellerId);
        return r.photos.listForProduct(input.productId);
      });
      return photos.map((p) => photoOut(p, ctx.media));
    }),

  startUpload: sellerProcedure
    .input(z.object({
      productId: z.string().uuid(),
      contentType: z.enum(IMAGE_TYPES),
      byteSize: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      const verdict = consume('upload', sellerId);
      if (!verdict.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rateLimitMessage(verdict.retryAfterSeconds) });
      }

      // Refused BEFORE anything is signed: a URL is an invitation to put bytes
      // in storage, and there is no reason to issue one for a file the size
      // alone already rules out.
      if (input.byteSize > MEDIA_LIMITS.maxBytes) throw refuse(['too_large_file']);

      const existing = await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        return r.photos.listForProduct(input.productId);
      });
      const room = objectionsToAddingPhoto({ existing: existing.length, alt: 'x', ownershipConfirmed: true });
      if (room.includes('too_many_photos')) throw refuse([], ['too_many_photos']);

      const key = productMediaKey(
        input.productId,
        input.contentType,
        (count) => crypto.getRandomValues(new Uint8Array(count)),
      );
      const upload = await ctx.media.presignUpload({
        key,
        contentType: input.contentType,
        expiresInSeconds: UPLOAD_SECONDS,
        now: ctx.clock.now(),
      });

      return {
        key,
        url: upload.url,
        method: upload.method,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      };
    }),

  confirm: sellerProcedure
    .input(z.object({
      productId: z.string().uuid(),
      key: z.string().min(1).max(200),
      alt: z.string().max(400),
      ownershipConfirmed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      // The key must be one WE issued for THIS product. A key for another
      // product — or another house — is not a photograph of this one.
      try {
        assertMediaKey(input.key);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الصورة غير صالح.' });
      }
      const declaredType = declaredTypeOf(input.key);
      if (!input.key.startsWith(`products/${input.productId}/`) || !declaredType) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الصورة غير صالح.' });
      }

      // Listing ownership first, so a house probing another house's keys learns
      // nothing from whether a file exists there.
      const existing = await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        return r.photos.listForProduct(input.productId);
      });

      // Confirming the same upload twice — a double tap, a retried request —
      // returns the photograph it already became rather than a second row.
      const already = existing.find((p) => p.storageKey === input.key);
      if (already) return photoOut(already, ctx.media);

      // The bytes decide, in the one place both upload flows share. A file that
      // can never become a photograph is removed there, before this throws.
      const verified = await verifyArrivedImage(ctx.media, input.key, declaredType);

      const photoObjections = objectionsToAddingPhoto({
        existing: existing.length,
        alt: input.alt,
        ownershipConfirmed: input.ownershipConfirmed,
      });
      if (photoObjections.length > 0) {
        // The FILE is good; the details are not. Keep the file.
        throw refuse([], photoObjections);
      }

      const added = await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        return r.photos.add(input.productId, {
          storageKey: input.key,
          alt: input.alt,
          ownershipConfirmed: input.ownershipConfirmed,
          contentType: verified.type,
          byteSize: verified.byteSize,
          width: verified.width,
          height: verified.height,
        });
      });
      return photoOut(added, ctx.media);
    }),

  describe: sellerProcedure
    .input(z.object({
      productId: z.string().uuid(),
      photoId: idSchema,
      alt: z.string().max(400),
      ownershipConfirmed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);
      const objections = objectionsToDescribing(input);
      if (objections.length > 0) throw refuse([], objections);

      const found = await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        return r.photos.describe(input.photoId, input.productId, input);
      });
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصورة غير موجودة' });
      return { ok: true as const };
    }),

  makePrimary: sellerProcedure
    .input(z.object({ productId: z.string().uuid(), photoId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);
      const found = await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        return r.photos.makePrimary(input.photoId, input.productId);
      });
      if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصورة غير موجودة' });
      return { ok: true as const };
    }),

  reorder: sellerProcedure
    .input(z.object({ productId: z.string().uuid(), photoIds: z.array(idSchema).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);
      await ctx.uow.transaction(async (r) => {
        await editableListing(r, input.productId, sellerId);
        const current = await r.photos.listForProduct(input.productId);
        const order = reorderedPhotos(current, input.photoIds);
        if (!order) {
          // A stale screen: somebody added or removed a photograph since this
          // list was drawn. Refused rather than guessed.
          throw new TRPCError({ code: 'CONFLICT', message: 'تغيّرت صور المنتج. حدّث الصفحة ثم رتّبها من جديد.' });
        }
        await r.photos.reorder(input.productId, order);
      });
      return { ok: true as const };
    }),

  remove: sellerProcedure
    .input(z.object({ productId: z.string().uuid(), photoId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const sellerId = houseOrThrow(ctx);

      const removed = await ctx.uow.transaction(async (r) => {
        const listing = await editableListing(r, input.productId, sellerId);
        const current = await r.photos.listForProduct(input.productId);
        const photo = current.find((p) => p.id === input.photoId);
        if (!photo) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصورة غير موجودة' });

        const objections = objectionsToRemovingPhoto({ photo, listingState: listing.state });
        if (objections.length > 0) throw refuse([], objections);

        return r.photos.remove(input.photoId, input.productId);
      });

      /*
       * The file is removed AFTER the row, and outside the transaction.
       *
       * The row is what the site believes; a file with no row is invisible.
       * Deleting the file first would, on a failed transaction, leave a row
       * pointing at nothing — a broken image on a live product. If this delete
       * fails the file is orphaned in storage, which costs a few megabytes and
       * shows nobody anything; the sweep for that is recorded in
       * docs/DEBT_REGISTER.md.
       */
      if (removed) {
        await ctx.media.remove(removed.storageKey).catch(() => undefined);
      }
      return { ok: true as const };
    }),
});
