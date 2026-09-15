/**
 * An editorial page, and the rules about publishing one.
 *
 * Pattern — State, as an explicit transition table, the same shape the
 * sub-order lifecycle uses. The reasoning is the same too: a `status` string
 * compared in route handlers is how a draft ends up on the shopfront.
 *
 *   draft ⇄ in_review → published ⇄ archived
 *                            ↑
 *                          draft   (a published page edited back to draft
 *                                   keeps serving its published version)
 *
 * THE ONE RULE THAT SHAPES EVERYTHING HERE: what a visitor sees never changes
 * because somebody is typing. Editing acts on a draft; the site serves the last
 * PUBLISHED revision, which is immutable. Publishing is the single act that
 * moves one to the other, and it is the only moment content on the site can
 * change. Without that separation, a half-finished sentence about a house is
 * one autosave away from the homepage.
 */
import { InvalidTransition, UnauthorisedActor } from '../errors/index';
import type { Clock } from '../ports/clock';
import { objectionsToPublishing, type Block, type PublishObjection } from './blocks';

export const PAGE_STATES = ['draft', 'in_review', 'published', 'archived'] as const;
export type PageState = (typeof PAGE_STATES)[number];

/**
 * Who may move a page, by state.
 *
 * An editor writes and submits; only a publisher publishes or archives. The
 * split exists because publishing is the irreversible-feeling act — the one a
 * visitor sees — and because a marketplace that lets any staff account change
 * the shopfront has made every staff account a brand risk.
 */
export const CONTENT_ROLES = ['editor', 'publisher'] as const;
export type ContentRole = (typeof CONTENT_ROLES)[number];

interface Move {
  readonly to: PageState;
  readonly by: readonly ContentRole[];
}

/**
 * Every legal move, in one table.
 *
 * `archived → draft` is deliberately present: an archived page is not deleted,
 * and bringing one back has to be possible without a database console. There is
 * no `published → archived → published` shortcut, because coming back means
 * being reviewed again.
 */
const TRANSITIONS: Readonly<Record<PageState, readonly Move[]>> = {
  draft: [
    { to: 'in_review', by: ['editor', 'publisher'] },
    { to: 'archived', by: ['publisher'] },
  ],
  in_review: [
    { to: 'draft', by: ['editor', 'publisher'] },
    { to: 'published', by: ['publisher'] },
  ],
  published: [
    // Editing a published page returns it to draft. The site keeps serving the
    // published revision throughout — see `servedRevisionId`.
    { to: 'draft', by: ['editor', 'publisher'] },
    { to: 'archived', by: ['publisher'] },
  ],
  archived: [
    { to: 'draft', by: ['publisher'] },
  ],
};

export function canMove(from: PageState, to: PageState, role: ContentRole): boolean {
  return (TRANSITIONS[from] ?? []).some((m) => m.to === to && m.by.includes(role));
}

export function nextStates(from: PageState, role: ContentRole): PageState[] {
  return (TRANSITIONS[from] ?? []).filter((m) => m.by.includes(role)).map((m) => m.to);
}

/** A page as the system holds it. Draft blocks and published blocks are separate. */
export interface ContentPage {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: PageState;
  /** What an editor is working on. Always present, even for a published page. */
  readonly draftBlocks: readonly Block[];
  /** The immutable revision the site serves. Null until first published. */
  readonly publishedRevisionId: string | null;
}

export interface PageMoved {
  readonly page: ContentPage;
  readonly from: PageState;
  readonly to: PageState;
  readonly at: Date;
  /** Set only when this move publishes — the revision to freeze and serve. */
  readonly publishes: boolean;
}

/**
 * Move a page, or explain why not.
 *
 * Throws for an illegal move or an unauthorised actor, because those are
 * programming or permission faults. Returns objections for content that is not
 * ready, because that is an editor's ordinary working state and not an error.
 */
export function movePage(
  page: ContentPage,
  to: PageState,
  role: ContentRole,
  clock: Clock,
  /** The image keys with a verified upload behind them — see `objectionsToPublishing`. */
  verifiedImageKeys: ReadonlySet<string>,
): { moved: PageMoved } | { objections: PublishObjection[] } {
  const legal = (TRANSITIONS[page.state] ?? []).find((m) => m.to === to);
  if (!legal) throw new InvalidTransition(page.state, to, 'content page');
  if (!legal.by.includes(role)) {
    throw new UnauthorisedActor(role, `move a page from ${page.state} to ${to}`);
  }

  /*
   * Content is checked at the moment of PUBLISHING, not while writing.
   *
   * A draft is allowed to be broken — that is what a draft is. Checking on
   * every keystroke produces a console that argues with the person using it
   * before they have finished the first sentence.
   */
  if (to === 'published') {
    const objections = objectionsToPublishing(page.draftBlocks, verifiedImageKeys);
    if (objections.length > 0) return { objections };
  }

  return {
    moved: {
      page, from: page.state, to, at: clock.now(), publishes: to === 'published',
    },
  };
}

/**
 * The revision a VISITOR is served, which is not always the page's own state.
 *
 * A published page pulled back to draft for editing keeps serving what it
 * published. Only archiving takes a page off the site. Getting this backwards
 * is how an editor opening a page to fix a typo takes it down.
 */
export function servedRevisionId(page: ContentPage): string | null {
  if (page.state === 'archived') return null;
  return page.publishedRevisionId;
}

/** Whether a visitor can reach this page at all. */
export function isVisible(page: ContentPage): boolean {
  return servedRevisionId(page) !== null;
}

/**
 * Slugs, which are URLs, which are forever.
 *
 * Lowercase Latin, digits and hyphens — the same alphabet the catalogue uses,
 * because a site with two slug conventions has one of them wrong. Arabic is the
 * site's language but not its URLs: a percent-encoded Arabic path is unreadable
 * in exactly the places a URL gets read aloud, pasted into a message, or
 * printed on a card.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Paths the site already owns. A page here would shadow a real route. */
const RESERVED_SLUGS = new Set([
  'cart', 'checkout', 'order', 'orders', 'p', 'seller', 'ops', 'api', 'search',
  'account', 'admin', 'assets', 'static',
  // The house storefronts. A page published at /house would shadow the whole
  // section, and the failure would look like the shop breaking rather than
  // like a bad slug.
  'house', 'houses',
  // The contact route. Fixed, linked from every screen, and not something an
  // editor should be able to shadow — a page published at /support would take
  // the marketplace's only contact form off the site.
  'support', 'apply',
]);

export function isUsableSlug(slug: string): boolean {
  if (!SLUG_PATTERN.test(slug)) return false;
  if (slug.length > 80) return false;
  return !RESERVED_SLUGS.has(slug);
}
