/**
 * Port: a product's photographs.
 *
 * Separate from `ListingRepository` rather than more methods on it. A listing's
 * fields are written together as one draft; photographs are added, described,
 * reordered and removed one at a time, each with its own rule. Folding them into
 * the listing port would give it two unrelated reasons to change.
 *
 * HOUSE SCOPING is not a parameter here, deliberately. The router confirms the
 * product belongs to the house (`listings.findForSeller`) before calling any of
 * these, and row-level security (`seller_manage_own_media`, 0002) refuses the
 * write again if it did not. What this port guarantees is that a photograph id
 * is only ever acted on together with the product it belongs to — so a valid
 * id from somebody else's product cannot be passed in under your own.
 *
 * TWO BEHAVIOURS ARE DECIDED HERE, not left to each adapter:
 *  - the first photograph a product receives is its primary;
 *  - removing a primary promotes the next photograph by position, so a product
 *    that still has photographs always has a primary. (Removing the primary of a
 *    LIVE listing is refused before this is called — `objectionsToRemovingPhoto`.)
 */
import type { ImageType } from '../catalogue/media';

export interface StoredPhoto {
  readonly id: string;
  readonly productId: string;
  /** A key into the media store — never a URL. */
  readonly storageKey: string;
  readonly alt: string;
  readonly position: number;
  readonly isPrimary: boolean;
  readonly ownershipConfirmed: boolean;
  /**
   * The facts read from the file (0021). Null together for a row that did not
   * come through the verified upload flow, which the shop does not render.
   */
  readonly contentType: ImageType | null;
  readonly byteSize: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface NewPhoto {
  readonly storageKey: string;
  readonly alt: string;
  readonly ownershipConfirmed: boolean;
  readonly contentType: ImageType;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

export interface PhotoRepository {
  /** In display order: position, then when it was added. */
  listForProduct(productId: string): Promise<StoredPhoto[]>;

  /** Appended last. The product's first photograph becomes its primary. */
  add(productId: string, photo: NewPhoto): Promise<StoredPhoto>;

  /** False when that photograph is not on that product. */
  describe(photoId: string, productId: string, input: {
    readonly alt: string;
    readonly ownershipConfirmed: boolean;
  }): Promise<boolean>;

  /** Makes this the only primary. False when that photograph is not on that product. */
  makePrimary(photoId: string, productId: string): Promise<boolean>;

  /**
   * Sets positions to the order given. The caller has already confirmed, with
   * `reorderedPhotos`, that the ids are exactly the product's photographs.
   */
  reorder(productId: string, orderedIds: readonly string[]): Promise<void>;

  /**
   * Removes the row and returns it, so the caller can remove the stored file
   * too. Null when that photograph is not on that product.
   */
  remove(photoId: string, productId: string): Promise<StoredPhoto | null>;
}
