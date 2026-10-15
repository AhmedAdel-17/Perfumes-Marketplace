'use client';

/**
 * The filter panel.
 *
 * EVERY CONTROL WRITES THE URL. Nothing here holds filter state of its own — a
 * filter in component state cannot be shared, breaks the back button, and is
 * gone on reload, so a customer who narrows to oud under 500, opens a bottle
 * and presses back lands on the whole catalogue and has to start again.
 *
 * The panel is a `<form>` that submits by GET, so it works with JavaScript
 * disabled and it degrades to exactly the same URLs. The client code only makes
 * it feel immediate.
 */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  activeFilterCount, catalogueQueryToSearch, parseCatalogueQuery, SCENT_FAMILIES, SORTS,
  type CatalogueQuery, type ScentFamily, type Sort,
} from '@diyar/domain';
import { langAttrs, data as num, pick, SCENT_FAMILY, SEARCH } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from '@/features/shell/LocaleProvider';

const SORT_KEY: Record<Sort, 'newest' | 'priceAsc' | 'priceDesc'> = {
  newest: 'newest',
  price_asc: 'priceAsc',
  price_desc: 'priceDesc',
};

/*
 * Identity v2: square, ruled, and a pressed filter is INKED rather than tinted —
 * the same reversal the note chips use, so "selected" looks the same on every
 * screen. `aria-pressed` carries the state for a screen reader; the fill is not
 * the only signal, because the label also moves from ink2 to ground.
 */
/**
 * The form's id. The search box sits in the page head, OUTSIDE this element,
 * and joins the form through the `form` attribute — so it is still one GET
 * form, one URL, and it still works with JavaScript off.
 */
export const FILTERS_FORM = 'catalogue-filters';

const chip = (on: boolean) => [
  'tappable flex min-h-touch items-center border px-4 text-body',
  'transition-colors duration-quick ease-out',
  on ? 'border-ink bg-ink text-ground' : 'border-line bg-raised text-ink hover:border-ink',
].join(' ');

/*
 * One scrolling row per group on a phone, wrapping from `lg`. Stacked and
 * wrapped, eight families and the houses filled the whole first screen of a
 * phone before a single perfume appeared; as rows they take a line each.
 * Bled to the screen edge so a half-visible chip says "there is more".
 */
// `min-w-0` on each fieldset: a fieldset's minimum width is its content's by
// default, so a scrolling row inside one would widen the page instead.
const chipRow = '-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 [&>*]:flex-none';

/** A field cut into the paper: the `sunken` well, a hairline, ink on focus. */
export const field = 'border border-line bg-sunken text-ink transition-colors duration-base ease-out placeholder:text-ink3 focus:border-ink focus:outline-none';

/*
 * Legends are Arabic on the Arabic site, so they are never letterspaced
 * (CLAUDE.md §15) — the first identity tracked them and broke the joins.
 */
const legend = 'mb-3 block w-full border-b border-line pb-2 text-small text-ink3';

export function Filters({ query, houses }: {
  query: CatalogueQuery;
  houses: Array<{ slug: string; name: string; nameEn: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locale = useLocale();
  const copy = SEARCH[locale];
  const families: Readonly<Record<ScentFamily, string>> = SCENT_FAMILY[locale];

  /** Rewrite the URL from a changed query. One path for every control. */
  const apply = (next: CatalogueQuery) => startTransition(() => {
    // `replace`, not `push`: a customer ticking four boxes should press back
    // once to leave the search, not four times to walk backwards through their
    // own filtering.
    router.replace(localeHref(locale, `/search${catalogueQueryToSearch(next)}`), { scroll: false });
  });

  const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
    (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const count = activeFilterCount(query);

  return (
    <form
      id={FILTERS_FORM}
      method="get"
      action={localeHref(locale, '/search')}
      // Submitting normally still works: the inputs are named exactly as the
      // parser reads them, so a browser with no JavaScript produces the same URL
      // this component would have written.
      className="flex flex-col gap-5 lg:gap-7"
      onSubmit={(event) => {
        event.preventDefault();
        const text = new FormData(event.currentTarget).get('q');
        apply({ ...query, text: typeof text === 'string' ? text : '' });
      }}
    >
      {/* --------------------------------------------------- the families */}
      <fieldset className="min-w-0">
        <legend className={legend}>{copy.family}</legend>
        <div className={chipRow}>
          {SCENT_FAMILIES.map((family) => (
            <button
              key={family}
              type="button"
              aria-pressed={query.families.includes(family)}
              disabled={pending}
              onClick={() => apply({ ...query, families: toggle(query.families, family) })}
              className={chip(query.families.includes(family))}
            >
              {families[family]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ----------------------------------------------------- the houses */}
      {houses.length > 1 && (
        <fieldset className="min-w-0">
          <legend className={legend}>{copy.house}</legend>
          <div className={chipRow}>
            {houses.map((house) => (
              <button
                key={house.slug}
                type="button"
                aria-pressed={query.houses.includes(house.slug)}
                disabled={pending}
                onClick={() => apply({ ...query, houses: toggle(query.houses, house.slug) })}
                className={chip(query.houses.includes(house.slug))}
              >
                <span {...langAttrs(locale, pick(locale, house.name, house.nameEn).lang)}>
                  {pick(locale, house.name, house.nameEn).text}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* ------------------------------------------------------ the price */}
      <fieldset className="min-w-0">
        <legend className={legend}>{copy.price}</legend>
        <div className="flex flex-wrap items-center gap-3">
          {(['minEgp', 'maxEgp'] as const).map((bound) => (
            <input
              key={bound}
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={query[bound] ?? ''}
              aria-label={bound === 'minEgp' ? copy.minPrice : copy.maxPrice}
              placeholder={bound === 'minEgp' ? copy.from : copy.to}
              onBlur={(event) => {
                const raw = event.target.value.trim();
                const value = raw === '' ? null : Number(raw);
                if (value === query[bound]) return;
                apply({ ...query, [bound]: Number.isFinite(value) ? value : null });
              }}
              className={`tnum h-control w-28 px-3 text-body ${field}`}
            />
          ))}

          <button
            type="button"
            aria-pressed={query.inStockOnly}
            disabled={pending}
            onClick={() => apply({ ...query, inStockOnly: !query.inStockOnly })}
            className={chip(query.inStockOnly)}
          >
            {copy.inStockOnly}
          </button>
        </div>
      </fieldset>

      {/* ------------------------------------------------ sort, and clear */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <div className="flex items-center gap-3">
          <label htmlFor="sort" className="text-small text-ink3">
            {copy.sort}
          </label>
          <select
            id="sort"
            value={query.sort}
            disabled={pending}
            onChange={(event) => apply({ ...query, sort: event.target.value as Sort })}
            className={`h-control px-3 text-body ${field}`}
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>{copy[SORT_KEY[sort]]}</option>
            ))}
          </select>
        </div>

        {count > 0 && (
          <button
            type="button"
            onClick={() => apply({
              // The search TEXT survives clearing the filters, because they are
              // two different acts: somebody clearing filters is widening a
              // search, not abandoning it.
              ...query, families: [], houses: [], minEgp: null, maxEgp: null, inStockOnly: false,
            })}
            className="tappable flex min-h-touch items-center text-small text-ink transition-colors duration-base ease-out hover:text-accent"
          >
            {copy.clear(num(count))}
          </button>
        )}
      </div>
    </form>
  );
}
