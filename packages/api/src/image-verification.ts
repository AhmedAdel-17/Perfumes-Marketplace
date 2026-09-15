/**
 * What ARRIVED in storage, checked — shared by every upload that ends in a row.
 *
 * Product photographs (`routers/photos.ts`) and editorial images
 * (`routers/content-images.ts`) both issue a signed URL, let the browser put
 * bytes behind it, and then must decide whether those bytes are an image this
 * site will serve. That decision was written once, inside the photograph
 * router; the second caller is the moment it becomes one function rather than
 * two copies that would drift the first time a limit changed.
 *
 * The rule, in order:
 *   1. the object exists (nothing arrived is not an image);
 *   2. its header is read and sniffed — the bytes decide the type, not the
 *      name and not what the browser declared;
 *   3. type, size and dimensions are held to `objectionsToImage`, and the type
 *      storage will SERVE it with must agree with what the bytes are;
 *   4. a file that fails is DELETED — it can never become anything, so it does
 *      not stay in storage costing money and confusing a later sweep.
 */
import { TRPCError } from '@trpc/server';
import {
  MEDIA_LIMITS, objectionsToImage, sniffImage,
  type ImageFacts, type ImageObjection, type ImageType,
} from '@diyar/domain';
import { IMAGE_OBJECTION_AR } from '@diyar/i18n';
import type { MediaStore } from './providers/media';

/** The type a key's extension promises. The key shape is checked before this is asked. */
export const TYPE_BY_EXTENSION: Readonly<Record<string, ImageType>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const declaredTypeOf = (key: string): ImageType | undefined =>
  TYPE_BY_EXTENSION[key.slice(key.lastIndexOf('.') + 1)];

/** Every objection, as the sentences a person reads — each once. */
export function refuseImage(objections: readonly ImageObjection[]): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: [...new Set(objections)].map((o) => IMAGE_OBJECTION_AR[o]).join(' '),
  });
}

export interface VerifiedImage extends ImageFacts {
  readonly byteSize: number;
}

/**
 * The facts of the file at `key`, or a refusal. A refused file has been removed.
 *
 * Throws `BAD_REQUEST` in Arabic either way, so a router can let it through.
 */
export async function verifyArrivedImage(
  media: MediaStore,
  key: string,
  declaredType: ImageType,
): Promise<VerifiedImage> {
  const stored = await media.describe(key);
  if (!stored) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم تصل الصورة إلى التخزين. أعد رفعها.' });
  }

  const header = await media.readHeader(key, MEDIA_LIMITS.headerBytes);
  const facts = header ? sniffImage(header) : null;

  const objections = objectionsToImage({ facts, declaredType, byteSize: stored.byteSize });
  if (facts && stored.contentType !== null && stored.contentType !== facts.type) {
    objections.push('type_mismatch');
  }

  if (objections.length > 0 || !facts) {
    await media.remove(key);
    throw refuseImage(objections.length > 0 ? objections : ['unsupported_type']);
  }

  return { ...facts, byteSize: stored.byteSize };
}
