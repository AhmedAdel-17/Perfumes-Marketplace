/**
 * Port: listings, as the people who own them see them.
 *
 * Separate from `ProductRepository`, which is the SHOPPING side — it answers
 * "what may I sell this visitor" and returns published rows priced for a cart.
 * This one answers "what has this house written", including drafts, rejections
 * and takedowns, and it is read by two audiences who must not share a query:
 * a house sees its own, an operator sees the queue.
 *
 * Putting both on one repository with a `sellerId?` argument would make the
 * wall between houses depend on an argument nobody passes wrongly on purpose.
 */
import type { ListingState, ModerationReason } from '../catalogue/listing';
import type { ListingDraft } from '../catalogue/completeness';

/** A listing as its own house sees it. */
export interface ListingRecord extends ListingDraft {
  readonly id: string;
  readonly sellerId: string;
  readonly state: ListingState;
  readonly moderationReason: ModerationReason | null;
  readonly submittedAt: Date | null;
  readonly moderatedAt: Date | null;
  readonly updatedAt: Date;
}

/** A listing in the moderation queue, with the house that wrote it. */
export interface QueuedListing {
  readonly id: string;
  readonly sellerId: string;
  readonly brandName: string;
  readonly name: string;
  readonly slug: string;
  readonly pricePiastres: number;
  readonly volumeMl: number;
  readonly submittedAt: Date | null;
  /** Everything a moderator has to read to decide. */
  readonly claimText: readonly string[];
}

export interface ListingRepository {
  /** Everything this house has written, newest activity first. */
  listForSeller(sellerId: string): Promise<ListingRecord[]>;

  /**
   * One listing, scoped to its house.
   *
   * The seller id is a PARAMETER rather than something the caller filters
   * afterwards. Row-level security would refuse the read anyway, but a
   * repository that returns a row and expects the caller to check whose it is
   * has put the wall in the wrong place.
   */
  findForSeller(id: string, sellerId: string): Promise<ListingRecord | null>;

  create(sellerId: string, input: { name: string; slug: string; sku: string; brandId: string }):
    Promise<ListingRecord>;

  /** Save a draft. Never touches state — that is `move`. */
  update(id: string, sellerId: string, input: ListingDraft): Promise<void>;

  /**
   * Move it, recording who decided and why.
   *
   * One call rather than a state setter plus a reason setter, because a
   * takedown whose reason was written by a second statement is a takedown that
   * can exist without one.
   */
  move(id: string, to: ListingState, input: {
    reason?: ModerationReason | null;
    moderatedBy?: string | null;
    at: Date;
  }): Promise<void>;

  /**
   * Whether it has a primary image with confirmed ownership, alt text, and the
   * facts the server read from the file — the publish gate's own rule (0024).
   *
   * All four, because the gate requires all four: a row whose file was never
   * verified is one the storefront refuses to render, and reporting it as a
   * closed gap would tell a house it may publish something Postgres will refuse.
   */
  hasPrimaryImage(id: string): Promise<boolean>;

  /** What is waiting on a moderator, oldest first. */
  moderationQueue(): Promise<QueuedListing[]>;

  /** For the moderator's own view of one listing. */
  findAnywhere(id: string): Promise<ListingRecord | null>;
}
