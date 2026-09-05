/**
 * Port: content storage.
 *
 * The domain states what it needs of a store and nothing about how one works.
 * The Drizzle adapter and the in-memory one both satisfy this, and the contract
 * test runs the same cases against both — which is the only reason the
 * in-memory one is trustworthy enough to use in the domain's own tests.
 *
 * Note what is NOT here: no "save blocks and publish" convenience. Publishing
 * writes a revision AND repoints the page, and if a store could be asked to do
 * only half of that, one day it would. The two writes happen inside a single
 * `publish` call for exactly that reason.
 */
import type { Block } from '../content/blocks';
import type { ContentPage, PageState } from '../content/page';

/** A published snapshot. Nothing ever rewrites one. */
export interface ContentRevision {
  readonly id: string;
  readonly pageId: string;
  readonly title: string;
  readonly blocks: readonly Block[];
  readonly publishedBy: string;
  readonly publishedAt: Date;
}

/** What a visitor is served: the page's identity, and the frozen revision. */
export interface LivePage {
  readonly slug: string;
  readonly title: string;
  readonly blocks: readonly Block[];
  readonly publishedAt: Date;
}

export interface ContentRepository {
  /** Every page, for the console. Includes drafts and archived pages. */
  list(): Promise<ContentPage[]>;

  findById(id: string): Promise<ContentPage | null>;

  /** By slug, for the console. Returns drafts too — `findLive` is the public one. */
  findBySlug(slug: string): Promise<ContentPage | null>;

  /**
   * What a visitor gets, or null.
   *
   * Separate from `findBySlug` on purpose. A single method with a `published`
   * flag is one forgotten argument away from serving a draft to the internet,
   * and the two callers want genuinely different shapes: the console wants the
   * draft it is editing, the site wants the frozen revision.
   */
  findLive(slug: string): Promise<LivePage | null>;

  /** Every page a visitor could reach, for the sitemap and the footer. */
  listLive(): Promise<Array<{ slug: string; title: string }>>;

  create(input: { slug: string; title: string }): Promise<ContentPage>;

  /** Save work in progress. Never touches what is being served. */
  saveDraft(id: string, input: { title: string; blocks: readonly Block[] }): Promise<void>;

  /** Move the page. The caller has already asked the state machine whether it may. */
  setState(id: string, state: PageState): Promise<void>;

  /**
   * Freeze the current draft as a revision, point the page at it, and mark it
   * published — as ONE unit. See the note at the top of this file.
   */
  publish(id: string, publishedBy: string): Promise<ContentRevision>;

  /** History, newest first. The console shows it; the public never sees it. */
  revisions(pageId: string): Promise<ContentRevision[]>;

  /**
   * Load an old revision back into the DRAFT. It does not publish.
   *
   * This is the whole reason immutable revisions are worth keeping, and the
   * separation is deliberate: a "restore" that went straight back onto the site
   * would let one mis-click undo a deliberate change, in public, with no review
   * — which is exactly the property publishing exists to prevent. Restoring
   * puts the old text in front of an editor; publishing it again is a second,
   * separate act by someone allowed to make it.
   *
   * Returns null when the revision does not belong to this page. Silently
   * restoring another page's content would be a cross-page write dressed as a
   * convenience.
   */
  restore(pageId: string, revisionId: string): Promise<ContentRevision | null>;
}
