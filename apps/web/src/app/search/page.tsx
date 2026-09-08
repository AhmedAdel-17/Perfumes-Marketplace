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
import { isEmptyQuery, parseCatalogueQuery } from '@diyar/domain';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
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

  return (
    <>
      <SiteHeader />

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
