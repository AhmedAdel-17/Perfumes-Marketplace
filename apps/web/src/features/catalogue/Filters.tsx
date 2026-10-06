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
import { useRouter, useSearchParams } from 'next/navigation';
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

const chip = (on: boolean) => [
  'tappable flex min-h-touch items-center rounded-sm border px-4 text-small',
  'transition-colors duration-base ease-out',
  on ? 'border-accent text-accent' : 'border-line text-ink hover:border-ink2',
].join(' ');

export function Filters({ query, houses }: {
  query: CatalogueQuery;
  houses: Array<{ slug: string; name: string; nameEn: string | null }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
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
      method="get"
      action={localeHref(locale, '/search')}
      // Submitting normally still works: the inputs are named exactly as the
      // parser reads them, so a browser with no JavaScript produces the same URL
      // this component would have written.
      className="border-b border-line pb-7"
      onSubmit={(event) => {
        event.preventDefault();
        const text = new FormData(event.currentTarget).get('q');
        apply({ ...query, text: typeof text === 'string' ? text : '' });
      }}
    >
      {/*
        ------------------------------------------------------ the box

        CAPPED, not full width. At the container's 1240px the field and its
        button ended up a thousand pixels apart, which reads as two unrelated
        controls — and a search box that wide is harder to scan than a short
        one, because the eye has no idea where the text will start.
      */}
      <div className="flex max-w-[540px] gap-3">
        <input
          name="q"
          defaultValue={query.text}
          // The key resets the field when the URL changes underneath it — a
          // cleared search must clear the box, and an uncontrolled input keeps
          // whatever was typed otherwise.
          key={params.toString()}
          maxLength={120}
          type="search"
          aria-label={copy.fieldLabel}
          placeholder={copy.fieldLabel}
          className="h-control w-full rounded-sm border border-line bg-ground px-4 text-bodyLg text-ink transition-colors duration-base ease-out placeholder:text-ink3 focus:border-ink2 focus:outline-none focus-visible:border-accent"
        />
        <button
          type="submit"
          className="tappable flex h-control min-w-touch items-center justify-center rounded-sm border border-line px-5 text-small text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
        >
          {copy.submit}
        </button>
      </div>

      {/* --------------------------------------------------- the families */}
      <fieldset className="mt-6">
        <legend className="mb-2.5 text-caption tracking-label text-ink3">{copy.family}</legend>
        <div className="flex flex-wrap gap-2">
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
        <fieldset className="mt-6">
          <legend className="mb-2.5 text-caption tracking-label text-ink3">{copy.house}</legend>
          <div className="flex flex-wrap gap-2">
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
      <fieldset className="mt-6">
        <legend className="mb-2.5 text-caption tracking-label text-ink3">
          {copy.price}
        </legend>
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
              className="tnum h-control w-28 rounded-sm border border-line bg-ground px-3 text-body text-ink transition-colors duration-base ease-out placeholder:text-ink3 focus:border-ink2 focus:outline-none focus-visible:border-accent"
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
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="sort" className="text-caption tracking-label text-ink3">
            {copy.sort}
          </label>
          <select
            id="sort"
            value={query.sort}
            disabled={pending}
            onChange={(event) => apply({ ...query, sort: event.target.value as Sort })}
            className="h-control rounded-sm border border-line bg-ground px-3 text-body text-ink transition-colors duration-base ease-out focus:border-ink2 focus:outline-none focus-visible:border-accent"
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
            className="tappable flex min-h-touch items-center text-caption tracking-label text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            {copy.clear(num(count))}
          </button>
        )}
      </div>
    </form>
  );
}
