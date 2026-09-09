import { describe, expect, it } from 'vitest';
import {
  ACCURACY_DIMENSION, EMPTY_SUMMARY, REVIEW_BODY_MAX, REVIEW_DIMENSIONS,
  assertHideable, assertRestorable, formatRating, objectionsToHiding,
  objectionsToReview, publicAuthorName, summarise, type Ratings,
} from './review';
import { InvalidTransition } from '../errors/index';

const rate = (value: number, overrides: Partial<Ratings> = {}): Ratings => ({
  scent: value, longevity: value, projection: value,
  value, packaging: value, descriptionAccuracy: value,
  ...overrides,
});

describe('what a review has to be before it is recorded', () => {
  it('accepts whole ratings inside the scale', () => {
    expect(objectionsToReview({ ratings: rate(4), body: 'عطر جميل' })).toEqual([]);
    expect(objectionsToReview({ ratings: rate(1), body: null })).toEqual([]);
    expect(objectionsToReview({ ratings: rate(5), body: null })).toEqual([]);
  });

  it('refuses a rating outside the scale, whichever end', () => {
    expect(objectionsToReview({ ratings: rate(0), body: null }))
      .toEqual(['rating_out_of_range']);
    expect(objectionsToReview({ ratings: rate(6), body: null }))
      .toEqual(['rating_out_of_range']);
  });

  it('refuses a half star', () => {
    // It arrives from a slider somebody built without reading the module, and
    // it would skew every average that is otherwise a mean of whole numbers.
    expect(objectionsToReview({ ratings: rate(4, { scent: 4.5 }), body: null }))
      .toEqual(['rating_not_whole']);
  });

  it('reports every objection, not the first', () => {
    const objections = objectionsToReview({
      ratings: rate(4, { scent: 9 }),
      body: 'ا'.repeat(REVIEW_BODY_MAX + 1),
    });
    expect(objections).toContain('rating_out_of_range');
    expect(objections).toContain('body_too_long');
  });

  it('measures the body after trimming', () => {
    // Otherwise a paste that ends in a newline is refused for being one
    // character too long, and the customer cannot see the character.
    const body = `${'ا'.repeat(REVIEW_BODY_MAX)}\n  `;
    expect(objectionsToReview({ ratings: rate(3), body })).toEqual([]);
  });

  it('names an out-of-range rating ONCE however many are wrong', () => {
    // Six copies of the same sentence is not six pieces of information.
    expect(objectionsToReview({ ratings: rate(99), body: null }))
      .toEqual(['rating_out_of_range']);
  });
});

describe('averaging', () => {
  it('says nothing rather than zero when there are no reviews', () => {
    // A product with no reviews rated 0.0 out of 5 is a product the page has
    // libelled. Null is the only honest answer, and the type forces the screen
    // to handle it.
    expect(summarise([])).toEqual(EMPTY_SUMMARY);
    expect(summarise([]).overall).toBeNull();
  });

  it('averages each dimension independently', () => {
    const summary = summarise([
      rate(5, { descriptionAccuracy: 1 }),
      rate(5, { descriptionAccuracy: 1 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.byDimension.scent).toBe(5);
    // The dimension that polices sellers survives the average intact. A house
    // scoring 5 on the perfume and 1 on the honesty of its listing must not
    // read as "mostly 5".
    expect(summary.byDimension[ACCURACY_DIMENSION]).toBe(1);
  });

  it('does not round', () => {
    // Rounding is a presentation decision made once, at the edge. A domain that
    // rounds and a screen that rounds again turns 4.45 into 5.
    const summary = summarise([rate(4), rate(5)]);
    expect(summary.overall).toBe(4.5);

    const uneven = summarise([rate(4), rate(4), rate(5)]);
    expect(uneven.overall).toBeCloseTo(13 / 3, 12);
    expect(uneven.overall).not.toBe(4.3);
  });

  it('the overall is the mean of the six dimension means', () => {
    const summary = summarise([rate(2, { scent: 5, packaging: 5 })]);
    // (5 + 2 + 2 + 2 + 5 + 2) / 6
    expect(summary.overall).toBeCloseTo(18 / 6, 12);
  });

  it('covers every dimension the module declares', () => {
    // A dimension added to the tuple and forgotten in `summarise` would return
    // undefined and render as NaN on the product page.
    const summary = summarise([rate(3)]);
    for (const dimension of REVIEW_DIMENSIONS) {
      expect(summary.byDimension[dimension], dimension).toBe(3);
    }
  });
});

describe('the name printed beside a public review', () => {
  it('is the given name and an initial', () => {
    expect(publicAuthorName('أحمد عادل محمود')).toBe('أحمد ع.');
    expect(publicAuthorName('Nour Hassan')).toBe('Nour H.');
  });

  it('leaves a single name alone', () => {
    // There is no surname to reduce, and an initial taken from the given name
    // would print "أحمد أ.".
    expect(publicAuthorName('أحمد')).toBe('أحمد');
  });

  it('falls back rather than printing an empty byline', () => {
    expect(publicAuthorName(null)).toBe('عميل ديار');
    expect(publicAuthorName('   ')).toBe('عميل ديار');
  });

  it('takes a whole character, not half of one', () => {
    // A name pasted with a combining mark sliced by `charAt` renders a lone
    // diacritic sitting on nothing.
    expect(publicAuthorName('نور عِماد')).toBe('نور ع.');
  });

  it('never returns more than the given name and one letter', () => {
    // The property, not the example: whatever arrives, nothing after the first
    // token survives as a readable word.
    const masked = publicAuthorName('محمد عبد الرحمن السيد');
    expect(masked).toBe('محمد ع.');
    expect(masked).not.toContain('الرحمن');
    expect(masked).not.toContain('السيد');
  });
});

describe('formatting a rating for a screen', () => {
  it('shows one decimal, and never a trailing zero', () => {
    expect(formatRating(4.25)).toBe('4.3');
    expect(formatRating(4)).toBe('4');
    expect(formatRating(4.0)).toBe('4');
    expect(formatRating(3.96)).toBe('4');
  });
});

describe('moderation', () => {
  it('refuses to hide a review with no reason written down', () => {
    // The note is the record of why criticism was removed. Without it,
    // "moderation removes abuse, not criticism" is an unfalsifiable claim.
    expect(objectionsToHiding('  ')).toEqual(['note_required']);
    expect(objectionsToHiding('لغة مسيئة')).toEqual([]);
  });

  it('refuses to hide what is already hidden', () => {
    // A second hide overwrites the note explaining the first.
    expect(() => assertHideable(new Date())).toThrow(InvalidTransition);
    expect(() => assertHideable(null)).not.toThrow();
  });

  it('refuses to restore what was never hidden', () => {
    expect(() => assertRestorable(null)).toThrow(InvalidTransition);
    expect(() => assertRestorable(new Date())).not.toThrow();
  });
});
