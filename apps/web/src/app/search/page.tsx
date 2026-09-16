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
import { counted, editorial, PERFUME } from '@diyar/i18n';
import { activeFilterCount, isEmptyQuery, parseCatalogueQuery } from '@diyar/domain';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { Filters } from '@/features/catalogue/Filters';
import { searchCatalogue } from '@/core/catalogue';

export const metadata: Metadata = {
  title: 'ابحث | ديار',
  // A filtered catalogue is thousands of near-identical pages to a crawler, and
  // every one of them competes with the ones worth ranking.
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function SearchPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const query = parseCatalogueQuery(await searchParams);
  const { products, houses } = await searchCatalogue(query);

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

      <main className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[88px]">
        <header className="pb-7 pt-8 lg:pb-8 lg:pt-12">
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">العطور</h1>
        </header>

        <Filters query={query} houses={houses} />

        {/*
          The count is stated, always — including when it is everything.

          A results page that only says something when it is empty leaves the
          customer to work out whether a filter did anything, and the answer is
          the one number they actually want.
        */}
        <p className="py-6 text-caption text-ink3 lg:py-7" aria-live="polite">
          {counted(products.length, PERFUME, editorial)}
        </p>

        {products.length === 0 ? (
          <div className="pb-12">
            <p className="text-bodyLg leading-relaxed text-ink2">
              {isEmptyQuery(query)
                ? 'لا توجد عطور معروضة حاليًا.'
                : 'لا يوجد عطر مطابق. جرّب توسيع الفلاتر أو كلمة أقصر.'}
            </p>
            {/*
              An empty result offers the way out rather than only the bad news.
              This is where a customer decides whether the shop is small or the
              search is bad, and a dead end answers that question wrongly.
            */}
            {!isEmptyQuery(query) && (
              <a
                href="/search"
                className="tappable mt-6 inline-flex min-h-touch items-center border-b border-accent/50 pb-2 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
              >
                اعرض كل العطور
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-14">
            {products.map((product, index) => (
              <Reveal key={product.id} delay={Math.min(index, 6) * 60}>
                <ProductTile product={product} />
              </Reveal>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
