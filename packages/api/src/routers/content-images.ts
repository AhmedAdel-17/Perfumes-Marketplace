import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { IMAGE_TYPES, MEDIA_LIMITS, contentMediaKey, type ContentImage } from '@diyar/domain';
import { assertMediaKey, type MediaStore } from '../providers/media';
import { declaredTypeOf, refuseImage, verifyArrivedImage } from '../image-verification';
import { consume, rateLimitMessage } from '../rate-limit';
import { platformProcedure, router } from '../trpc';

/**
 * Editorial images — WORK_PLAN 5.7.6.
 *
 * The same two steps as a house's photographs (`photos.ts`), for an operator
 * writing a page:
 *
 *   startUpload — the page must exist; the declared size must fit; a PUT URL is
 *                 signed under a RANDOM key in the page's own prefix.
 *   confirm     — the key must be one issued for THIS page; the bytes that
 *                 arrived are verified; only then is a `content_images` row
 *                 written. From that moment a block may name the key.
 *
 * What is NOT here is anything that attaches the image to a block. The block
 * is part of the draft, saved by `content.saveDraft` like every other field; the
 * publish rule refuses a block whose key has no record. Keeping the two apart
 * means an image can be uploaded, reused, or left out, without this router
 * learning anything about how a page is laid out.
 */

const UPLOAD_SECONDS = 600;

function staffOrThrow(ctx: { platformStaffId: string | null }): string {
  if (!ctx.platformStaffId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'انتهت الجلسة' });
  return ctx.platformStaffId;
}

const imageOut = (image: ContentImage, media: MediaStore) => ({
  key: image.storageKey,
  url: media.publicUrl(image.storageKey),
  width: image.width,
  height: image.height,
});

export const contentImagesRouter = router({
  startUpload: platformProcedure
    .input(z.object({
      pageId: z.string().uuid(),
      contentType: z.enum(IMAGE_TYPES),
      byteSize: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const staffId = staffOrThrow(ctx);

      // The same allowance a house gets, keyed on the operator: a stolen staff
      // session should not be a way to fill a bucket either.
      const verdict = consume('upload', `staff:${staffId}`);
      if (!verdict.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rateLimitMessage(verdict.retryAfterSeconds) });
      }

      if (input.byteSize > MEDIA_LIMITS.maxBytes) throw refuseImage(['too_large_file']);

      const page = await ctx.uow.transaction((r) => r.content.findById(input.pageId));
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });

      const key = contentMediaKey(
        input.pageId,
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

  confirm: platformProcedure
    .input(z.object({
      pageId: z.string().uuid(),
      key: z.string().min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const staffId = staffOrThrow(ctx);

      // A key WE issued, for THIS page. Anything else — a product photograph's
      // key, another page's, a path typed by hand — is not an upload to confirm.
      const declaredType = declaredTypeOf(input.key);
      try {
        assertMediaKey(input.key);
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الصورة غير صالح.' });
      }
      if (!input.key.startsWith(`content/${input.pageId}/`) || !declaredType) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الصورة غير صالح.' });
      }

      const [page, already] = await ctx.uow.transaction(async (r) => [
        await r.content.findById(input.pageId),
        (await r.contentImages.findByKeys([input.key]))[0],
      ] as const);
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });

      // Confirmed before — a double tap, a retry. The same image, not a second.
      if (already) return imageOut(already, ctx.media);

      const verified = await verifyArrivedImage(ctx.media, input.key, declaredType);

      const recorded = await ctx.uow.transaction((r) => r.contentImages.record({
        storageKey: input.key,
        contentType: verified.type,
        byteSize: verified.byteSize,
        width: verified.width,
        height: verified.height,
        uploadedBy: staffId,
      }));
      return imageOut(recorded, ctx.media);
    }),
});
