import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, catalogueQueryToSearch, EMPTY_QUERY, isEmptyQuery, MAX_PRICE_EGP,
  parseCatalogueQuery, queryTerms,
} from './catalogue-query';

describe('reading a query out of a URL', () => {
  it('is empty when nothing was asked', () => {
    expect(parseCatalogueQuery({})).toEqual(EMPTY_QUERY);
    expect(isEmptyQuery(parseCatalogueQuery({}))).toBe(true);
  });

  it('reads the text, the families, the houses and the sort', () => {
    const query = parseCatalogueQuery({
      q: 'عود', family: ['oud', 'amber'], house: 'maison-nour', sort: 'price_asc',
    });
    expect(query.text).toBe('عود');
    expect(query.families).toEqual(['oud', 'amber']);
    expect(query.houses).toEqual(['maison-nour']);
    expect(query.sort).toBe('price_asc');
  });

  it('accepts a repeated key OR a comma list, because both URLs get written', () => {
    expect(parseCatalogueQuery({ family: ['oud', 'musk'] }).families).toEqual(['oud', 'musk']);
    expect(parseCatalogueQuery({ family: 'oud,musk' }).families).toEqual(['oud', 'musk']);
  });

  it('drops a family that is not one', () => {
    // A hand-edited URL must narrow the catalogue or do nothing — never widen
    // it, and never reach the database as an unknown enum.
    expect(parseCatalogueQuery({ family: ['oud', 'vanilla-latte'] }).families).toEqual(['oud']);
  });

  it('drops a house slug that could not be a slug', () => {
    expect(parseCatalogueQuery({ house: ["'; DROP TABLE products; --"] }).houses).toEqual([]);
    expect(parseCatalogueQuery({ house: '../admin' }).houses).toEqual([]);
  });

  it('de-duplicates and caps a list', () => {
    expect(parseCatalogueQuery({ family: ['oud', 'oud'] }).families).toEqual(['oud']);
    const many = Array.from({ length: 40 }, (_, i) => `house-${i}`);
    expect(parseCatalogueQuery({ house: many }).houses.length).toBeLessThanOrEqual(12);
  });

  it('falls back to the default sort rather than trusting the URL', () => {
    expect(parseCatalogueQuery({ sort: 'cheapest-ever' }).sort).toBe('newest');
  });

  it('trims an over-long search box', () => {
    expect(parseCatalogueQuery({ q: 'ع'.repeat(500) }).text.length).toBe(120);
  });
});

describe('price bounds', () => {
  it('reads whole pounds', () => {
    const query = parseCatalogueQuery({ min: '200', max: '900' });
    expect(query.minEgp).toBe(200);
    expect(query.maxEgp).toBe(900);
  });

  it('treats an unparseable bound as absent, NOT as zero', () => {
    /*
     * Zero is a real bound meaning "free". Turning a typo into it would filter
     * the catalogue down to nothing while the field on screen showed a number,
     * which reads as an empty shop rather than a bad filter.
     */
    expect(parseCatalogueQuery({ max: 'كتير' }).maxEgp).toBeNull();
    expect(parseCatalogueQuery({ max: '' }).maxEgp).toBeNull();
    expect(parseCatalogueQuery({ min: '-40' }).minEgp).toBeNull();
  });

  it('caps a bound so a stray zero cannot produce a meaningless filter', () => {
    expect(parseCatalogueQuery({ max: '99999999' }).maxEgp).toBe(MAX_PRICE_EGP);
  });

  it('SWAPS a reversed range rather than returning nothing', () => {
    // Someone typing 500 into "from" and 200 into "to" has said what they want
    // perfectly clearly. "We have nothing between 500 and 200" is not a
    // sentence anybody should have to parse.
    const query = parseCatalogueQuery({ min: '500', max: '200' });
    expect(query.minEgp).toBe(200);
    expect(query.maxEgp).toBe(500);
  });

  it('leaves one-sided ranges alone', () => {
    expect(parseCatalogueQuery({ min: '300' }).maxEgp).toBeNull();
    expect(parseCatalogueQuery({ max: '300' }).minEgp).toBeNull();
  });
});

describe('writing a query back to a URL', () => {
  it('is empty for an empty query', () => {
    expect(catalogueQueryToSearch(EMPTY_QUERY)).toBe('');
  });

  it('omits defaults, so one search is one URL', () => {
    expect(catalogueQueryToSearch({ ...EMPTY_QUERY, sort: 'newest' })).toBe('');
    expect(catalogueQueryToSearch({ ...EMPTY_QUERY, sort: 'price_asc' })).toBe('?sort=price_asc');
  });

  it('sorts multi-values, so tick order does not change the URL', () => {
    const a = catalogueQueryToSearch({ ...EMPTY_QUERY, families: ['musk', 'amber'] });
    const b = catalogueQueryToSearch({ ...EMPTY_QUERY, families: ['amber', 'musk'] });
    expect(a).toBe(b);
  });

  it('round-trips', () => {
    /*
     * The property that makes the whole thing safe to build a UI on: parse then
     * serialise then parse produces the same query. Without it a filter panel
     * that re-writes the URL on every change slowly mangles the state.
     */
    const original = parseCatalogueQuery({
      q: 'عود سيوة', family: ['oud', 'woody'], house: 'atelier-siwa',
      min: '200', max: '900', stock: '1', sort: 'price_desc',
    });
    const url = catalogueQueryToSearch(original);
    const params = Object.fromEntries(
      [...new URLSearchParams(url.slice(1)).entries()]
        .reduce((map, [k, v]) => map.set(k, [...(map.get(k) ?? []), v]), new Map<string, string[]>()),
    );
    expect(parseCatalogueQuery(params)).toEqual(original);
  });

  it('encodes Arabic so the URL survives being pasted', () => {
    const url = catalogueQueryToSearch({ ...EMPTY_QUERY, text: 'ليل القاهرة' });
    expect(url).toContain('q=');
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url)).toContain('ليل القاهرة');
  });
});

describe('what the screen needs to know', () => {
  it('counts the active filters, and does not count the search text', () => {
    // The text has its own box on screen; counting it in the "filters" badge
    // would tell somebody to clear filters they cannot see.
    const query = parseCatalogueQuery({ q: 'عود', family: 'oud', stock: '1', max: '900' });
    expect(activeFilterCount(query)).toBe(3);
  });

  it('is not empty once anything is set', () => {
    expect(isEmptyQuery(parseCatalogueQuery({ stock: '1' }))).toBe(false);
    expect(isEmptyQuery(parseCatalogueQuery({ sort: 'price_asc' }))).toBe(true);
  });

  it('folds the search text into terms', () => {
    // Through the same fold the stored text uses — see arabic-search.ts.
    expect(queryTerms(parseCatalogueQuery({ q: 'ليل القاهره' }))).toEqual(['ليل', 'القاهره']);
  });
});
