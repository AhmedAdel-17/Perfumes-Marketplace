/**
 * Search and browse.
 *
 * The home page opens with one object at scale because it is selling the idea
 * of the catalogue. This is the other half — the screen for somebody who
 * already knows roughly what they want and needs the shop to get out of the way.
 *
 * Everything is server-rendered from the URL, so a search is a page: shareable,
 * bookmarkable, and correct after a reload or a back press.
 */
import type { Metadata } from 'next';
import { countedIn, editorialIn, NOUN, SEARCH, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { localeHref } from '@/core/href';
import { activeFilterCount, isEmptyQuery, parseCatalogueQuery } from '@diyar/domain';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { SpecimenCard, type CardRating } from '@/features/catalogue/SpecimenCard';
import { api } from '@/core/api';
import { Filters } from '@/features/catalogue/Filters';
import { SearchBox } from '@/features/catalogue/SearchBox';
import { searchCatalogue } from '@/core/catalogue';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${SEARCH[locale].metaTitle} | ${SHELL[locale].titleSuffix}`,
    // A filtered catalogue is thousands of near-identical pages to a crawler,
    // and every one of them competes with the ones worth ranking.
    robots: { index: false, follow: true },
  };
}

export const dynamic = 'force-dynamic';

export default async function SearchPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const query = parseCatalogueQuery(await searchParams);
  const { products, houses } = await searchCatalogue(query);

  /*
   * Ratings for every card, asked in batches: `reviews.summaries` takes at most
   * sixty ids, and a catalogue past sixty would otherwise rate its first page
   * and leave the rest blank — a grid where some perfumes seem unreviewed only
   * because of where they fell.
   */
  const ids = products.map((p) => p.id);
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) batches.push(ids.slice(i, i + 60));
  const ratings: Record<string, CardRating> = Object.assign(
    {},
    ...(await Promise.all(batches.map((productIds) => api().reviews.summaries({ productIds })))),
  );

  /*
   * Three different things happen on this screen, and only two are events.
   *
   * Typing words is a `search`. Narrowing by family, house, price or stock is a
   * `filter_apply`. Opening /search with nothing set is neither — it is the
   * catalogue, and counting it as a search would put every visitor who pressed
   * "العطور" into the numerator of "searches that found nothing".
   *
   * WHAT IS RECORDED IS THAT IT HAPPENED, never the words: the event carries no
   * payload, and the search box is exactly where somebody types a name or a
   * phone number (A-1, migration 0023).
   */
  const filters = activeFilterCount(query);
  const searched = query.text.trim() !== '';
  const locale = await getLocale();
  const copy = SEARCH[locale];

  return (
    <>
      <SiteHeader />

      {/* Keyed by the query, so each new search mounts its own tracker rather
          than reusing the previous one — see the note in the product page. */}
      {(searched || filters > 0) && (
        <Track
          key={`${query.text}|${filters}`}
          event={searched ? 'search' : 'filter_apply'}
        />
      )}

      {/*
        Visual identity v2: the catalogue as the register's full listing. A
        ruled head that states the count, the filters in a ruled column at the
        start edge, and the perfumes on the same specimen cards as the home page,
        so a perfume looks the same wherever it is listed.
      */}
      <main className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[104px]">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink pb-4 pt-8 lg:pt-12">
          <div>
            <span className="latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
              {copy.kicker.toUpperCase()}
              <span aria-hidden="true" className="h-px w-12 bg-current" />
            </span>
            <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{copy.title}</h1>
          </div>
          <SearchBox text={query.text} />
        </header>

        <div className="mt-7 grid gap-8 lg:mt-8 lg:grid-cols-12">
          <aside aria-labelledby="filters-title" className="min-w-0 lg:col-span-3">
            <h2 id="filters-title" className="sr-only">{copy.filters}</h2>
            <Filters query={query} houses={houses} />
          </aside>

          <div className="lg:col-span-9">
            {/*
              The count is stated, always — including when it is everything.

              A results page that only says something when it is empty leaves
              the customer to work out whether a filter did anything, and the
              answer is the one number they actually want.
            */}
            <p className="mb-4 text-body text-ink2 lg:text-bodyLg" aria-live="polite">
              {countedIn(locale, products.length, NOUN.perfume, editorialIn(locale))}
            </p>
            {products.length === 0 ? (
              <div className="border border-line bg-raised p-6 lg:p-8">
                <p className="text-bodyLg leading-relaxed text-ink2">
                  {isEmptyQuery(query) ? copy.nothingPublished : copy.noMatch}
                </p>
                {/*
                  An empty result offers the way out rather than only the bad
                  news. This is where a customer decides whether the shop is
                  small or the search is bad, and a dead end answers that
                  question wrongly.
                */}
                {!isEmptyQuery(query) && (
                  <a
                    href={localeHref(locale, '/search')}
                    className="tappable mt-4 inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
                  >
                    <span className="link-line">{copy.showAll}</span>
                  </a>
                )}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
                {products.map((product, index) => (
                  <Reveal as="li" key={product.id} delay={Math.min(index, 6) * 60}>
                    <SpecimenCard
                      product={product}
                      locale={locale}
                      rating={ratings[product.id]}
                      sizes="(min-width: 1024px) 24vw, 50vw"
                    />
                  </Reveal>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
