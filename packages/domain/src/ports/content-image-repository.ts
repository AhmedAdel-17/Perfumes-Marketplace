/**
 * Port: the images an editorial page may show — WORK_PLAN 5.7.6.
 *
 * An image block stores a KEY into the media store, never a URL (`ImageBlock`).
 * Until this port, nothing said which keys were images at all: the console had a
 * text field, and whatever was typed into it was saved, previewed and published.
 * A key to nothing rendered a placeholder on the public site; a key to somebody's
 * product photograph rendered that photograph on a page nobody reviewed it for.
 *
 * So an image becomes usable in content the same way a product photograph does:
 * the file is uploaded, the server reads the bytes that ARRIVED, and only then is
 * a record written. A block may name a key only if that record exists — the
 * publish rule asks this port, and the renderer resolves keys through it.
 *
 * Separate from `ContentRepository`: pages change as drafts and revisions, images
 * as uploads, and neither has any reason to change when the other does.
 */
import type { ImageType } from '../catalogue/media';

export interface ContentImage {
  /** A key into the media store — never a URL. Unique. */
  readonly storageKey: string;
  readonly contentType: ImageType;
  readonly byteSize: number;
  /** As displayed, after EXIF orientation. */
  readonly width: number;
  readonly height: number;
  /** The operator who uploaded it. Uploading content is attributable, like publishing it. */
  readonly uploadedBy: string;
}

export type NewContentImage = ContentImage;

export interface ContentImageRepository {
  /**
   * Record a verified image.
   *
   * Recording a key that is already recorded returns the EXISTING record and
   * changes nothing: a confirm tapped twice, or retried after a timeout, is the
   * same upload, and the facts were read from the same bytes.
   */
  record(image: NewContentImage): Promise<ContentImage>;

  /**
   * The recorded images among these keys, in no particular order.
   *
   * Keys with no record are simply absent — the caller decides what an
   * unverified key means (refuse to publish; draw nothing). An empty request is
   * an empty answer, never a query.
   */
  findByKeys(keys: readonly string[]): Promise<ContentImage[]>;
}
