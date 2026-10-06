/**
 * The content model.
 *
 * A CLOSED SET OF BLOCKS, never a rich-text box.
 *
 * The usual CMS gives an editor a WYSIWYG field and stores HTML. That is two
 * problems wearing one hat. The first is injection, and it is the one everybody
 * names. The second is the one that actually damages this product: an editor
 * with a font menu will use it, and the seventh page will not look like the
 * first six. On a marketplace whose proposition is that it looks considered,
 * the design system has to keep control of appearance while the editor keeps
 * control of meaning.
 *
 * So a block says WHAT it is — a section opening, a passage, a pair of columns,
 * a list of notes — and the renderer alone decides how that looks. An editor
 * cannot choose a typeface here any more than they can choose one in a printed
 * catalogue. That is the point.
 *
 * Pattern — a discriminated union with a per-kind registry (Open-Closed). A new
 * block is a new entry in one table plus one renderer; it is never a new arm
 * added to a switch statement in five files, which is how block models rot.
 *
 * Everything here is pure data. Rendering lives in the web app, validation at
 * the API boundary, persistence in the database — and this file knows about
 * none of them.
 */

/** Every block kind the system will store. Adding one is a deliberate act. */
export const BLOCK_KINDS = [
  'heading',
  'passage',
  'pull_quote',
  'note_list',
  'image',
  'divider',
  'call_to_action',
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * Heading levels are 2 and 3 only.
 *
 * There is exactly one `h1` on a page and the page's own title supplies it, so
 * an editor who could emit another would break the document outline for every
 * screen reader on the site. Level 4 is missing because a passage that needs
 * four levels of nesting is a passage that needs rewriting.
 */
export const HEADING_LEVELS = [2, 3] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

export interface HeadingBlock {
  kind: 'heading';
  level: HeadingLevel;
  text: string;
}

export interface PassageBlock {
  kind: 'passage';
  /** Plain text. Paragraphs are separated by a blank line, nothing else. */
  text: string;
}

/*
 * The optional fields below are written `?: T | undefined`, not `?: T`.
 *
 * `exactOptionalPropertyTypes` is on, which makes those two genuinely different
 * types: the second permits the key to be ABSENT, the first also permits it to
 * be present holding `undefined`. Zod's `.optional()` produces the second, so a
 * parsed block was not assignable to a domain block and the guard in
 * `content-validation.ts` caught it on the line whose only job is to catch it.
 *
 * Written the wider way here rather than narrowed at the boundary, because this
 * data arrives as JSON and survives a round trip through JSONB — and the honest
 * description of a field that may or may not be there, in a shape nobody
 * controls end to end, is the wider one.
 */
export interface PullQuoteBlock {
  kind: 'pull_quote';
  text: string;
  /** Who said it. Absent for an unattributed line of house copy. */
  attribution?: string | undefined;
}

/**
 * A list of scent notes, or of anything else that reads as a labelled set.
 *
 * Its own kind rather than a passage containing dashes, because the renderer
 * sets these in the note typography the product pages already use — and because
 * a list stored as prose cannot later be searched, counted or translated.
 */
export interface NoteListBlock {
  kind: 'note_list';
  items: ReadonlyArray<{ term: string; detail?: string | undefined }>;
}

export interface ImageBlock {
  kind: 'image';
  /** A key into the media store, never a URL — the origin is not content. */
  mediaKey: string;
  /**
   * Required, always. An image block with no alternative text is not a
   * publishable block: the type says so, so the omission is caught while the
   * page is being written rather than by an accessibility audit months later.
   */
  alt: string;
  caption?: string | undefined;
}

export interface DividerBlock {
  kind: 'divider';
}

export interface CallToActionBlock {
  kind: 'call_to_action';
  label: string;
  /** An internal path. External links are not authorable — see `isInternalPath`. */
  href: string;
}

export type Block =
  | HeadingBlock
  | PassageBlock
  | PullQuoteBlock
  | NoteListBlock
  | ImageBlock
  | DividerBlock
  | CallToActionBlock;

/**
 * Limits, chosen against the typography rather than against a round number.
 *
 * A heading longer than this wraps to three lines at the display size and stops
 * being a heading. A passage longer than this is a page. They exist so an
 * editor discovers the constraint while writing, not after publishing.
 */
export const LIMITS = {
  headingText: 120,
  passageText: 4000,
  quoteText: 400,
  attribution: 80,
  noteTerm: 60,
  noteDetail: 200,
  noteItems: 24,
  alt: 300,
  caption: 200,
  ctaLabel: 40,
  blocksPerPage: 60,
} as const;

/**
 * Links are internal only.
 *
 * An editor cannot author an outbound link, because the console is reachable by
 * anyone who takes over a platform staff account, and "publish a link" is the
 * cheapest way to turn a trusted domain into a phishing host. Outbound links,
 * when they are needed, will be a separate block with a reviewed allow-list.
 */
export function isInternalPath(href: string): boolean {
  // A leading slash is necessary and nowhere near sufficient: `//evil.test` is
  // a protocol-relative URL that browsers follow off-site, and `/\evil.test` is
  // treated the same way by several of them.
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//') || href.startsWith('/\\')) return false;
  if (href.includes('://')) return false;
  // Control characters and whitespace. A tab or a newline inside an href can
  // hide the rest of the URL from whoever reviews it, and browsers strip them
  // before navigating — so what a reviewer reads and what a visitor visits are
  // not the same string.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007F]/.test(href)) return false;
  return true;
}

/** A block that carries no content contributes nothing and is not publishable. */
export function isEmptyBlock(block: Block): boolean {
  switch (block.kind) {
    case 'heading': return block.text.trim().length === 0;
    case 'passage': return block.text.trim().length === 0;
    case 'pull_quote': return block.text.trim().length === 0;
    case 'note_list': return block.items.length === 0
      || block.items.every((i) => i.term.trim().length === 0);
    case 'image': return block.mediaKey.trim().length === 0;
    case 'divider': return false; // a divider is content by being present
    case 'call_to_action': return block.label.trim().length === 0
      || block.href.trim().length === 0;
  }
}

/**
 * Why a set of blocks may not be published yet.
 *
 * Returns reasons rather than a boolean, and returns ALL of them rather than
 * the first: an editor who fixes one problem and is immediately shown the next
 * gives up somewhere around the third. Every form on this site reports every
 * fault at once, and the console is not exempt because its users are staff.
 */
export type PublishObjection = (
  | { code: 'empty_document'; blockIndex?: undefined }
  | { code: 'empty_block'; blockIndex: number }
  | { code: 'too_many_blocks'; blockIndex?: undefined }
  | { code: 'heading_order'; blockIndex: number }
  | { code: 'external_link'; blockIndex: number }
  | { code: 'missing_alt'; blockIndex: number }
  /** A key with no verified upload behind it (`content_images`, 0022). */
  | { code: 'unverified_image'; blockIndex: number }
  | { code: 'over_length'; blockIndex: number }
) & {
  /** Set when the fault is in the page's ENGLISH blocks rather than its Arabic ones. */
  readonly inEnglish?: true;
};

/**
 * Every image key these blocks name, each once, blank keys excluded.
 *
 * What a caller looks up in `ContentImageRepository` before asking
 * `objectionsToPublishing`, and what a renderer resolves to addresses.
 */
export function imageKeysIn(blocks: readonly Block[]): string[] {
  return [...new Set(blocks.flatMap((block) =>
    (block.kind === 'image' && block.mediaKey.trim().length > 0 ? [block.mediaKey] : [])))];
}

/**
 * `verifiedImageKeys` is REQUIRED, not defaulted. An optional set would make
 * "forgot to look the images up" indistinguishable from "this page has none",
 * and the first caller to forget would publish whatever key an operator typed.
 * A document with no image blocks passes an empty set, and says so.
 */
export function objectionsToPublishing(
  blocks: readonly Block[],
  verifiedImageKeys: ReadonlySet<string>,
): PublishObjection[] {
  const objections: PublishObjection[] = [];

  if (blocks.length === 0) return [{ code: 'empty_document' }];
  if (blocks.length > LIMITS.blocksPerPage) objections.push({ code: 'too_many_blocks' });

  /*
   * Heading order is checked HERE rather than in the accessibility audit.
   *
   * The audit runs against pages that exist; content is written after it. An
   * editor who opens a section with a level 3 produces a document outline with
   * a hole in it, and nothing downstream can repair that — so the console
   * refuses to publish it, at the moment the person who can fix it is looking.
   */
  let seenLevelTwo = false;

  blocks.forEach((block, blockIndex) => {
    if (isEmptyBlock(block)) objections.push({ code: 'empty_block', blockIndex });

    switch (block.kind) {
      case 'heading':
        if (block.level === 2) seenLevelTwo = true;
        else if (!seenLevelTwo) objections.push({ code: 'heading_order', blockIndex });
        if (block.text.length > LIMITS.headingText) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'passage':
        if (block.text.length > LIMITS.passageText) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'pull_quote':
        if (block.text.length > LIMITS.quoteText
          || (block.attribution ?? '').length > LIMITS.attribution) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'note_list':
        if (block.items.length > LIMITS.noteItems
          || block.items.some((i) => i.term.length > LIMITS.noteTerm
            || (i.detail ?? '').length > LIMITS.noteDetail)) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'image':
        if (block.alt.trim().length === 0) objections.push({ code: 'missing_alt', blockIndex });
        // A blank key is already `empty_block`; reporting it twice would give an
        // editor two instructions for one missing picture.
        if (block.mediaKey.trim().length > 0 && !verifiedImageKeys.has(block.mediaKey)) {
          objections.push({ code: 'unverified_image', blockIndex });
        }
        if (block.alt.length > LIMITS.alt || (block.caption ?? '').length > LIMITS.caption) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'call_to_action':
        if (!isInternalPath(block.href)) objections.push({ code: 'external_link', blockIndex });
        if (block.label.length > LIMITS.ctaLabel) {
          objections.push({ code: 'over_length', blockIndex });
        }
        break;

      case 'divider':
        break;
    }
  });

  return objections;
}
