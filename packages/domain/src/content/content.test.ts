import { describe, expect, it } from 'vitest';
import { InvalidTransition, UnauthorisedActor } from '../errors/index';
import { FixedClock } from '../ports/clock';
import {
  isEmptyBlock, isInternalPath, LIMITS, objectionsToPublishing, type Block,
} from './blocks';
import {
  canMove, isUsableSlug, isVisible, movePage, nextStates, PAGE_STATES,
  servedRevisionId, type ContentPage, type PageState,
} from './page';

const clock = new FixedClock(new Date('2026-09-04T10:00:00.000Z'));

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
    expect(objectionsToPublishing(blocks)).toContainEqual({
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
    const codes = objectionsToPublishing(blocks).map((o) => o.code).sort();
    expect(codes).toEqual(['empty_block', 'external_link', 'heading_order']);
  });

  it('refuses an empty document', () => {
    expect(objectionsToPublishing([])).toEqual([{ code: 'empty_document' }]);
  });

  it('refuses a document that opens at level 3', () => {
    expect(objectionsToPublishing([{ kind: 'heading', level: 3, text: 'فرع' }]))
      .toContainEqual({ code: 'heading_order', blockIndex: 0 });
  });

  it('accepts level 3 once a level 2 has opened a section', () => {
    const blocks: Block[] = [
      { kind: 'heading', level: 2, text: 'قسم' },
      { kind: 'heading', level: 3, text: 'فرع' },
    ];
    expect(objectionsToPublishing(blocks)).toEqual([]);
  });

  it('refuses an image with no alternative text', () => {
    const blocks: Block[] = [{ kind: 'image', mediaKey: 'm1', alt: '  ' }];
    const codes = objectionsToPublishing(blocks).map((o) => o.code);
    expect(codes).toContain('missing_alt');
  });

  it.each([
    ['heading', { kind: 'heading', level: 2, text: 'ا'.repeat(LIMITS.headingText + 1) }],
    ['passage', { kind: 'passage', text: 'ا'.repeat(LIMITS.passageText + 1) }],
    ['pull_quote', { kind: 'pull_quote', text: 'ا'.repeat(LIMITS.quoteText + 1) }],
  ] as const)('refuses an over-long %s', (_kind, block) => {
    const blocks: Block[] = [{ kind: 'heading', level: 2, text: 'قسم' }, block as Block];
    expect(objectionsToPublishing(blocks).map((o) => o.code)).toContain('over_length');
  });

  it('refuses a document longer than any page', () => {
    const blocks: Block[] = [
      { kind: 'heading', level: 2, text: 'قسم' },
      ...Array.from({ length: LIMITS.blocksPerPage }, (): Block => ({ kind: 'divider' })),
    ];
    expect(objectionsToPublishing(blocks).map((o) => o.code)).toContain('too_many_blocks');
  });

  it('treats a divider as content, because it is', () => {
    expect(isEmptyBlock({ kind: 'divider' })).toBe(false);
  });

  it('treats a note list of blank terms as empty', () => {
    expect(isEmptyBlock({ kind: 'note_list', items: [{ term: ' ' }, { term: '' }] })).toBe(true);
  });
});

/* --------------------------------------------------------- the state machine */

describe('moving a page', () => {
  it('sends a draft for review', () => {
    const result = movePage(page(), 'in_review', 'editor', clock);
    expect('moved' in result && result.moved.to).toBe('in_review');
  });

  it('refuses to let an editor publish', () => {
    expect(() => movePage(page({ state: 'in_review' }), 'published', 'editor', clock))
      .toThrow(UnauthorisedActor);
  });

  it('lets a publisher publish a reviewed page', () => {
    const result = movePage(page({ state: 'in_review' }), 'published', 'publisher', clock);
    expect('moved' in result && result.moved.publishes).toBe(true);
  });

  it('refuses to publish a page straight from draft', () => {
    // Review is not optional. A single pair of eyes is how the shopfront
    // acquires a sentence nobody meant to ship.
    expect(() => movePage(page(), 'published', 'publisher', clock))
      .toThrow(InvalidTransition);
  });

  it('names the page in the error, not the sub-order', () => {
    // The message hardcoded "sub-order" when there was only one state machine.
    expect(() => movePage(page(), 'published', 'publisher', clock))
      .toThrow(/content page/);
  });

  it('returns objections instead of publishing broken content', () => {
    const broken = page({ state: 'in_review', draftBlocks: [{ kind: 'passage', text: '' }] });
    const result = movePage(broken, 'published', 'publisher', clock);
    expect('objections' in result && result.objections.length).toBeGreaterThan(0);
  });

  it('lets a broken DRAFT be saved and reviewed', () => {
    // A draft is allowed to be broken. That is what a draft is.
    const broken = page({ draftBlocks: [{ kind: 'passage', text: '' }] });
    expect('moved' in movePage(broken, 'in_review', 'editor', clock)).toBe(true);
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
