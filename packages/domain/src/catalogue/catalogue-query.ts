/**
 * What a customer is asking the catalogue for.
 *
 * THE QUERY LIVES IN THE URL, and that is a decision rather than an
 * implementation detail. A filter held in component state cannot be shared,
 * cannot be bookmarked, breaks the back button, and is gone when the page
 * reloads — so a customer who filters to oud under 500 pounds, opens a bottle,
 * and presses back lands on the unfiltered catalogue and has to do it again.
 * That is the single most common way a shop loses somebody who was ready to buy.
 *
 * So this parses a URL, clamps everything, and serialises back to a CANONICAL
 * string. Canonical matters: two URLs that mean the same search should be the
 * same URL, or they are two cache entries, two analytics rows, and two pages
 * for a search engine to call duplicates.
 *
 * Everything here is pure. It knows nothing about how the catalogue is stored.
 */
// `ScentFamily` comes from the vocabularies module rather than being
// redeclared here — two exported names for one type is two things to keep
// in step, and the barrel refuses the ambiguity outright.
import { SCENT_FAMILIES, type ScentFamily } from './vocabularies';
import { searchTerms } from './arabic-search';

export const SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type Sort = (typeof SORTS)[number];

/**
 * The price bounds a customer may set, in whole pounds.
 *
 * The ceiling exists so a typo cannot produce a filter that means nothing and
 * a number nobody can read: someone who types an extra zero should see the
 * filter refuse rather than silently return the whole shop.
 */
export const MAX_PRICE_EGP = 100_000;

/** More than this and a "filter" is a list of everything, phrased as a URL. */
const MAX_MULTI = 12;

export interface CatalogueQuery {
  readonly text: string;
  readonly families: readonly ScentFamily[];
  readonly houses: readonly string[];
  /** Whole pounds, inclusive. Null means unbounded on that side. */
  readonly minEgp: number | null;
  readonly maxEgp: number | null;
  readonly inStockOnly: boolean;
  readonly sort: Sort;
}

export const EMPTY_QUERY: CatalogueQuery = {
  text: '',
  families: [],
  houses: [],
  minEgp: null,
  maxEgp: null,
  inStockOnly: false,
  sort: 'newest',
};

/** A URL carries a value once or many times; both shapes arrive here. */
type Param = string | string[] | undefined;

const many = (value: Param): string[] => {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : value.split(',');
  return [...new Set(raw.map((v) => v.trim()).filter(Boolean))].slice(0, MAX_MULTI);
};

const one = (value: Param): string =>
  (Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();

/**
 * A price bound, or null.
 *
 * Anything unparseable becomes null rather than zero. Zero is a real bound that
 * means "free", and turning a typo into it would quietly filter the catalogue
 * down to nothing while the field showed a number.
 */
function price(value: Param): number | null {
  const raw = one(value);
  if (raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(Math.floor(parsed), MAX_PRICE_EGP);
}

export function parseCatalogueQuery(
  params: Readonly<Record<string, Param>>,
): CatalogueQuery {
  const families = many(params['family'])
    .filter((f): f is ScentFamily => (SCENT_FAMILIES as readonly string[]).includes(f));

  let minEgp = price(params['min']);
  let maxEgp = price(params['max']);

  /*
   * A reversed range is SWAPPED, not rejected.
   *
   * Somebody typing 500 into the "from" box and 200 into the "to" box has said
   * what they want perfectly clearly. Returning nothing would be technically
   * defensible and would read as "we have nothing between 500 and 200", which
   * is not a sentence anybody should have to parse.
   */
  if (minEgp !== null && maxEgp !== null && minEgp > maxEgp) {
    [minEgp, maxEgp] = [maxEgp, minEgp];
  }

  const sort = one(params['sort']);

  return {
    text: one(params['q']).slice(0, 120),
    families,
    houses: many(params['house']).filter((h) => /^[a-z0-9-]+$/.test(h)),
    minEgp,
    maxEgp,
    inStockOnly: one(params['stock']) === '1',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : 'newest',
  };
}

/**
 * Back to a URL, canonically.
 *
 * Keys in a fixed order and defaults omitted, so the same search is always the
 * same string. Without that, `?sort=newest&q=عود` and `?q=عود` are two pages
 * that a search engine calls duplicates and analytics calls different.
 */
export function catalogueQueryToSearch(query: CatalogueQuery): string {
  const parts: string[] = [];
  const add = (key: string, value: string) =>
    parts.push(`${key}=${encodeURIComponent(value)}`);

  if (query.text.trim() !== '') add('q', query.text.trim());
  // Sorted, so the order somebody happened to tick the boxes in does not
  // produce a different URL for the same search.
  for (const family of [...query.families].sort()) add('family', family);
  for (const house of [...query.houses].sort()) add('house', house);
  if (query.minEgp !== null) add('min', String(query.minEgp));
  if (query.maxEgp !== null) add('max', String(query.maxEgp));
  if (query.inStockOnly) add('stock', '1');
  if (query.sort !== 'newest') add('sort', query.sort);

  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/** Whether the customer has actually asked for anything. */
export function isEmptyQuery(query: CatalogueQuery): boolean {
  return query.text.trim() === ''
    && query.families.length === 0
    && query.houses.length === 0
    && query.minEgp === null
    && query.maxEgp === null
    && !query.inStockOnly;
}

/** How many filters are on, for the "clear" control and its label. */
export function activeFilterCount(query: CatalogueQuery): number {
  return query.families.length
    + query.houses.length
    + (query.minEgp !== null ? 1 : 0)
    + (query.maxEgp !== null ? 1 : 0)
    + (query.inStockOnly ? 1 : 0);
}

/** The folded terms this query is looking for. Empty when it is a browse. */
export function queryTerms(query: CatalogueQuery): string[] {
  return searchTerms(query.text);
}
