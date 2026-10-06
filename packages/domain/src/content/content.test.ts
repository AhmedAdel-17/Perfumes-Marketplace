import { describe, expect, it } from 'vitest';
import { InvalidTransition, UnauthorisedActor } from '../errors/index';
import { FixedClock } from '../ports/clock';
import {
  imageKeysIn, isEmptyBlock, isInternalPath, LIMITS, objectionsToPublishing, type Block,
} from './blocks';
import {
  canMove, isUsableSlug, isVisible, movePage, nextStates, PAGE_STATES,
  servedRevisionId, type ContentPage, type PageState,
} from './page';

const clock = new FixedClock(new Date('2026-09-04T10:00:00.000Z'));

/** No verified images — stated, for documents that have no image block to verify. */
const NONE: ReadonlySet<string> = new Set();

const page = (over: Partial<ContentPage> = {}): ContentPage => ({
  id: 'p1',
  slug: 'about',
  title: 'عن ديار',
  state: 'draft',
  draftBlocks: [
    { kind: 'heading', level: 2, text: 'من نحن' },
    { kind: 'passage', text: 'دور عطور مصرية.' },
  ],
  publishedRevisionId: null,
  titleEn: null,
  draftBlocksEn: [],
  ...over,
});

/* ------------------------------------------------------------------- links */

describe('links an editor may author', () => {
  it.each(['/', '/about', '/p/nur-layl-50', '/order', '/a-b-c/d'])(
    'accepts the internal path %s', (href) => {
      expect(isInternalPath(href)).toBe(true);
    },
  );

  it.each([
    ['https://evil.test', 'an absolute URL'],
    ['http://evil.test', 'the same without TLS'],
    ['//evil.test', 'protocol-relative — browsers follow this off-site'],
    ['/\\evil.test', 'a backslash, which several browsers treat as //'],
    ['javascript:alert(1)', 'a script URL'],
    ['JavaScript:alert(1)', 'the same with different casing'],
    ['data:text/html,<script>alert(1)</script>', 'a data URL'],
    ['about', 'no leading slash, so it resolves relative to wherever it appears'],
    ['/ok\thttps://evil.test', 'a tab, which hides the rest from a reviewer'],
    ['/ok\nhttps://evil.test', 'a newline, likewise'],
    ['/ok https://evil.test', 'a space'],
  ])('refuses %s (%s)', (href) => {
    expect(isInternalPath(href)).toBe(false);
  });

  it('refuses an external link inside a call to action', () => {
    const blocks: Block[] = [
      { kind: 'heading', level: 2, text: 'اكتشف' },
      { kind: 'call_to_action', label: 'زورونا', href: 'https://evil.test' },
    ];
    expect(objectionsToPublishing(blocks, NONE)).toContainEqual({
      code: 'external_link', blockIndex: 1,
    });
  });
});

/* ------------------------------------------------------- publish objections */

describe('what stops a page being published', () => {
  it('reports EVERY objection, not the first', () => {
    // An editor who fixes one fault and is immediately shown the next gives up
    // somewhere around the third.
    const blocks: Block[] = [
      { kind: 'heading', level: 3, text: 'يبدأ بمستوى ثالث' },
      { kind: 'passage', text: '   ' },
      { kind: 'call_to_action', label: 'اذهب', href: 'https://evil.test' },
    ];
    const codes = objectionsToPublishing(blocks, NONE).map((o) => o.code).sort();
    expect(codes).toEqual(['empty_block', 'external_link', 'heading_order']);
  });

  it('refuses an empty document', () => {
    expect(objectionsToPublishing([], NONE)).toEqual([{ code: 'empty_document' }]);
  });

  it('refuses a document that opens at level 3', () => {
    expect(objectionsToPublishing([{ kind: 'heading', level: 3, text: 'فرع' }], NONE))
      .toContainEqual({ code: 'heading_order', blockIndex: 0 });
  });

  it('accepts level 3 once a level 2 has opened a section', () => {
    const blocks: Block[] = [
      { kind: 'heading', level: 2, text: 'قسم' },
      { kind: 'heading', level: 3, text: 'فرع' },
    ];
    expect(objectionsToPublishing(blocks, NONE)).toEqual([]);
  });

  it('refuses an image with no alternative text', () => {
    const blocks: Block[] = [{ kind: 'image', mediaKey: 'm1', alt: '  ' }];
    const codes = objectionsToPublishing(blocks, NONE).map((o) => o.code);
    expect(codes).toContain('missing_alt');
  });

  it.each([
    ['heading', { kind: 'heading', level: 2, text: 'ا'.repeat(LIMITS.headingText + 1) }],
    ['passage', { kind: 'passage', text: 'ا'.repeat(LIMITS.passageText + 1) }],
    ['pull_quote', { kind: 'pull_quote', text: 'ا'.repeat(LIMITS.quoteText + 1) }],
  ] as const)('refuses an over-long %s', (_kind, block) => {
    const blocks: Block[] = [{ kind: 'heading', level: 2, text: 'قسم' }, block as Block];
    expect(objectionsToPublishing(blocks, NONE).map((o) => o.code)).toContain('over_length');
  });

  it('refuses a document longer than any page', () => {
    const blocks: Block[] = [
      { kind: 'heading', level: 2, text: 'قسم' },
      ...Array.from({ length: LIMITS.blocksPerPage }, (): Block => ({ kind: 'divider' })),
    ];
    expect(objectionsToPublishing(blocks, NONE).map((o) => o.code)).toContain('too_many_blocks');
  });

  it('treats a divider as content, because it is', () => {
    expect(isEmptyBlock({ kind: 'divider' })).toBe(false);
  });

  it('treats a note list of blank terms as empty', () => {
    expect(isEmptyBlock({ kind: 'note_list', items: [{ term: ' ' }, { term: '' }] })).toBe(true);
  });
});

/* ----------------------------------------------------------- images (5.7.6) */

describe('an image a page may publish', () => {
  const KEY = 'content/p1/aaaaaaaaaaaaaaaaaaaaaaaa.jpg';
  const withImage = (mediaKey: string): Block[] => [
    { kind: 'heading', level: 2, text: 'في المعمل' },
    { kind: 'image', mediaKey, alt: 'قوارير الزيوت على رفّ خشبي' },
  ];

  it('refuses an image whose key was never verified, and names the block', () => {
    // The console used to accept any text as a key. A key typed by hand is the
    // exact thing this refuses — whether it names nothing or someone else's file.
    expect(objectionsToPublishing(withImage(KEY), NONE))
      .toEqual([{ code: 'unverified_image', blockIndex: 1 }]);
  });

  it('accepts the same block once its key is verified', () => {
    expect(objectionsToPublishing(withImage(KEY), new Set([KEY]))).toEqual([]);
  });

  it('reports a blank key once, as an empty block', () => {
    expect(objectionsToPublishing(withImage('  '), NONE).map((o) => o.code)).toEqual(['empty_block']);
  });

  it('holds publishing to it, and nothing short of publishing', () => {
    const inReview = page({ state: 'in_review', draftBlocks: withImage(KEY) });
    expect(movePage(inReview, 'published', 'publisher', clock, NONE))
      .toEqual({ objections: [{ code: 'unverified_image', blockIndex: 1 }] });
    expect('moved' in movePage(inReview, 'published', 'publisher', clock, new Set([KEY]))).toBe(true);

    // A draft may be broken — submitting it for review is not publishing it.
    expect('moved' in movePage(page({ draftBlocks: withImage(KEY) }), 'in_review', 'editor', clock, NONE))
      .toBe(true);
  });

  it('lists each image key once, and no blank ones', () => {
    const blocks: Block[] = [
      ...withImage(KEY),
      { kind: 'image', mediaKey: KEY, alt: 'مرّة ثانية' },
      { kind: 'image', mediaKey: ' ', alt: 'بلا ملف' },
      // A passage that happens to contain a key is text, not an image.
      { kind: 'passage', text: KEY },
    ];
    expect(imageKeysIn(blocks)).toEqual([KEY]);
  });
});

/* --------------------------------------------------------- the state machine */

describe('moving a page', () => {
  it('sends a draft for review', () => {
    const result = movePage(page(), 'in_review', 'editor', clock, NONE);
    expect('moved' in result && result.moved.to).toBe('in_review');
  });

  it('refuses to let an editor publish', () => {
    expect(() => movePage(page({ state: 'in_review' }), 'published', 'editor', clock, NONE))
      .toThrow(UnauthorisedActor);
  });

  it('lets a publisher publish a reviewed page', () => {
    const result = movePage(page({ state: 'in_review' }), 'published', 'publisher', clock, NONE);
    expect('moved' in result && result.moved.publishes).toBe(true);
  });

  it('refuses to publish a page straight from draft', () => {
    // Review is not optional. A single pair of eyes is how the shopfront
    // acquires a sentence nobody meant to ship.
    expect(() => movePage(page(), 'published', 'publisher', clock, NONE))
      .toThrow(InvalidTransition);
  });

  it('names the page in the error, not the sub-order', () => {
    // The message hardcoded "sub-order" when there was only one state machine.
    expect(() => movePage(page(), 'published', 'publisher', clock, NONE))
      .toThrow(/content page/);
  });

  it('returns objections instead of publishing broken content', () => {
    const broken = page({ state: 'in_review', draftBlocks: [{ kind: 'passage', text: '' }] });
    const result = movePage(broken, 'published', 'publisher', clock, NONE);
    expect('objections' in result && result.objections.length).toBeGreaterThan(0);
  });

  it('lets a broken DRAFT be saved and reviewed', () => {
    // A draft is allowed to be broken. That is what a draft is.
    const broken = page({ draftBlocks: [{ kind: 'passage', text: '' }] });
    expect('moved' in movePage(broken, 'in_review', 'editor', clock, NONE)).toBe(true);
  });

  it('has no move that is legal for nobody', () => {
    for (const from of PAGE_STATES) {
      for (const to of PAGE_STATES) {
        const anyone = canMove(from, to, 'editor') || canMove(from, to, 'publisher');
        const listed = nextStates(from, 'publisher').includes(to)
          || nextStates(from, 'editor').includes(to);
        expect(anyone, `${from} → ${to}`).toBe(listed);
      }
    }
  });

  it('never lets a page move to itself', () => {
    for (const state of PAGE_STATES) {
      expect(canMove(state, state, 'publisher'), state).toBe(false);
    }
  });

  it('leaves every state reachable', () => {
    // A state nothing can enter is dead code in the schema, and a state nothing
    // can leave is a trap an editor cannot escape without a database console.
    for (const state of PAGE_STATES) {
      const enterable = PAGE_STATES.some((from) => canMove(from, state, 'publisher'));
      const leavable = nextStates(state, 'publisher').length > 0;
      expect(enterable || state === 'draft', `nothing enters ${state}`).toBe(true);
      expect(leavable, `nothing leaves ${state}`).toBe(true);
    }
  });
});

/* --------------------------------------------------- what a visitor is served */

describe('what a visitor sees', () => {
  it('serves nothing before the first publish', () => {
    expect(isVisible(page())).toBe(false);
  });

  it('keeps serving the published revision while the page is edited', () => {
    // The rule the whole design turns on. An editor opening a page to fix a
    // typo must not take it down.
    const edited = page({ state: 'draft', publishedRevisionId: 'rev-7' });
    expect(servedRevisionId(edited)).toBe('rev-7');
    expect(isVisible(edited)).toBe(true);
  });

  it('serves it while in review too', () => {
    const reviewing = page({ state: 'in_review', publishedRevisionId: 'rev-7' });
    expect(isVisible(reviewing)).toBe(true);
  });

  it('stops serving an archived page', () => {
    const archived = page({ state: 'archived', publishedRevisionId: 'rev-7' });
    expect(servedRevisionId(archived)).toBeNull();
    expect(isVisible(archived)).toBe(false);
  });

  it('is visible in exactly the states that serve a revision', () => {
    for (const state of PAGE_STATES) {
      const p = page({ state: state as PageState, publishedRevisionId: 'rev-7' });
      expect(isVisible(p), state).toBe(servedRevisionId(p) !== null);
    }
  });
});

/* ------------------------------------------------------------------- slugs */

describe('slugs', () => {
  it.each(['about', 'care-guide', 'houses-of-cairo', 'a1'])('accepts %s', (slug) => {
    expect(isUsableSlug(slug)).toBe(true);
  });

  it.each([
    ['About', 'uppercase'],
    ['care_guide', 'an underscore'],
    ['-about', 'a leading hyphen'],
    ['about-', 'a trailing hyphen'],
    ['care--guide', 'a doubled hyphen'],
    ['عن-ديار', 'Arabic, which percent-encodes into an unreadable URL'],
    ['', 'nothing'],
    ['../etc/passwd', 'a traversal'],
    ['a'.repeat(81), 'longer than any URL should be'],
  ])('refuses %s (%s)', (slug) => {
    expect(isUsableSlug(slug)).toBe(false);
  });

  it.each(['cart', 'checkout', 'order', 'p', 'seller', 'ops', 'api'])(
    'refuses %s, which the site already owns', (slug) => {
      // A page at one of these would shadow a real route, and the failure would
      // present as the shop breaking rather than as a bad slug.
      expect(isUsableSlug(slug)).toBe(false);
    },
  );
});

/* ------------------------------------------------------ the English half */

describe('the English half of a page (D-3)', () => {
  const inReview = (over: Partial<ContentPage> = {}) => page({ state: 'in_review', ...over });

  it('an untranslated page publishes — the English site shows the Arabic', () => {
    expect('moved' in movePage(inReview(), 'published', 'publisher', clock, NONE)).toBe(true);
  });

  it('a started translation is held to the same rules, and says it is the English', () => {
    const broken = inReview({
      titleEn: 'About',
      draftBlocksEn: [
        { kind: 'heading', level: 3, text: 'Out of order' },
        { kind: 'passage', text: 'Body' },
      ],
    });
    expect(movePage(broken, 'published', 'publisher', clock, NONE))
      .toEqual({ objections: [{ code: 'heading_order', blockIndex: 0, inEnglish: true }] });
  });

  it('a complete translation publishes with the Arabic', () => {
    const translated = inReview({
      titleEn: 'About',
      draftBlocksEn: [{ kind: 'heading', level: 2, text: 'Who we are' }, { kind: 'passage', text: 'Body' }],
    });
    expect('moved' in movePage(translated, 'published', 'publisher', clock, NONE)).toBe(true);
  });
});
