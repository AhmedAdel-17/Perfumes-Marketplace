/**
 * Port: reviews.
 *
 * The shape of this port is the security design, so it is worth reading before
 * the implementations.
 *
 * A guest has no account. The only identity they hold is the order reference
 * they were given and the phone they ordered on — the same two factors that
 * open the tracking screen. So every write here takes those two factors and a
 * LINE ITEM, and derives everything else — which sub-order, which product,
 * which customer — inside the query, from the database.
 *
 * That is not a convenience. The alternative is a router that looks the order
 * up, reads the customer id out of the result, and passes it back down to an
 * insert; and that shape has a comparison in the middle of it that a later
 * refactor can drop, exactly as the first version of order lookup dropped the
 * phone check and disclosed every order to anyone holding a reference. Here
 * there is nothing to drop: a line item belonging to a different order simply
 * matches no row, and the write returns null.
 *
 * Interface Segregation, as elsewhere in this directory: the public read side
 * (`summariesFor`, `listForProduct`) is used by the catalogue and knows nothing
 * about phones; the moderation side is used by one console screen.
 */
import type { Ratings, ReviewSummary } from '../trust/review';

/**
 * A line item this order is entitled to review.
 *
 * Only DELIVERED sub-orders produce these — the trigger in migration 0001 would
 * refuse the insert otherwise, and offering a form that the database will
 * reject is worse than not offering it.
 */
export interface ReviewableLine {
  readonly lineItemId: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly brandName: string;
  readonly volumeMl: number;
  /** Already reviewed. The unique index on `line_item_id` allows exactly one. */
  readonly reviewed: boolean;
}

/** A review as the product page shows it. */
export interface PublishedReview {
  readonly id: string;
  readonly ratings: Ratings;
  readonly body: string | null;
  /**
   * Given name and an initial — masked by the domain's `publicAuthorName`, in
   * both adapters, asserted by the contract.
   */
  readonly authorName: string;
  readonly createdAt: Date;
}

/** A review as an operator sees it, hidden ones included. */
export interface ModeratedReview extends PublishedReview {
  readonly productId: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly brandName: string;
  readonly hiddenAt: Date | null;
  readonly moderationNote: string | null;
}

export interface ReviewRepository {
  /**
   * What this order can review, resolved from the two factors.
   *
   * Returns an empty list for a wrong phone exactly as for an unknown
   * reference, so it cannot be used to discover which references exist.
   */
  listReviewable(input: {
    readonly reference: string;
    readonly phone: string;
  }): Promise<readonly ReviewableLine[]>;

  /**
   * Record a review. Null when those two factors do not own that line item, or
   * when it has not been delivered, or when it has already been reviewed.
   *
   * ONE undifferentiated null, deliberately. Distinguishing "not yours" from
   * "already reviewed" tells whoever is probing which line items exist.
   */
  record(input: {
    readonly reference: string;
    readonly phone: string;
    readonly lineItemId: string;
    readonly ratings: Ratings;
    readonly body: string | null;
    readonly incentiveDisclosed: boolean;
    readonly now: Date;
  }): Promise<{ readonly id: string; readonly productSlug: string } | null>;

  /** One product's averages. Visible reviews only. */
  summaryFor(productId: string): Promise<ReviewSummary>;

  /**
   * Many products' averages in ONE read.
   *
   * The catalogue grid shows a rating on every tile. Asking per tile is an
   * N+1 on the busiest page of the site, and it is the kind that only appears
   * once the catalogue is big enough for it to hurt.
   *
   * Products with no visible reviews are absent from the map rather than
   * present with a zero — the caller substitutes `EMPTY_SUMMARY`, which is the
   * value that says "nobody has said yet".
   */
  summariesFor(productIds: readonly string[]): Promise<ReadonlyMap<string, ReviewSummary>>;

  /** Newest first. Hidden reviews are not returned to anybody but an operator. */
  listForProduct(input: {
    readonly productId: string;
    readonly limit: number;
  }): Promise<readonly PublishedReview[]>;

  /** The moderation queue: everything, newest first, hidden ones included. */
  listForModeration(input: { readonly limit: number }): Promise<readonly ModeratedReview[]>;

  /**
   * Hide a review, with the reason written down. False when there is no such
   * review, or it is already hidden.
   *
   * Nothing here deletes. Doc 04 §3: "Brands cannot delete or privately
   * suppress negative reviews" — and neither, in the end, can we: a hidden row
   * keeps its ratings, its body and now a note saying who removed it and why.
   */
  hide(input: {
    readonly id: string;
    readonly note: string;
    readonly moderatorId: string;
    readonly now: Date;
  }): Promise<boolean>;

  /** Put one back. False when there is no such review, or it is not hidden. */
  restore(input: {
    readonly id: string;
    readonly moderatorId: string;
    readonly now: Date;
  }): Promise<boolean>;
}
