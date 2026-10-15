/**
 * Every house on the marketplace.
 *
 * Without this, a house was reachable only from a perfume — which means a
 * customer could find a maker only by first finding something they made. On a
 * marketplace whose argument is the makers, that is the wrong way round: the
 * question "who is on here?" had no answer at all.
 *
 * A REGISTER TABLE, not a grid of cards (visual identity v2 — the houses table
 * in 04-laboratoire.html, the same component as the home page's section 05).
 * Houses have no logos yet, and a grid of identical rectangles differing only
 * in text carries no more than a table while claiming to; the table at least
 * lets the eye run down a column and compare.
 */
import type { Metadata } from 'next';
import { countedIn, editorialIn, HOUSES, NOUN, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { HouseTable } from '@/features/catalogue/HouseTable';
import { listHouses } from '@/core/catalogue';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: `${HOUSES[locale].title} | ${SHELL[locale].titleSuffix}`,
    description: HOUSES[locale].metaDescription,
  };
}

export const dynamic = 'force-dynamic';

export default async function HousesPage() {
  const houses = await listHouses();
  const locale = await getLocale();
  const copy = HOUSES[locale];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[104px]">
        <header className="grid gap-x-8 gap-y-4 border-b border-ink pb-6 pt-8 lg:grid-cols-12 lg:items-end lg:pt-12">
          <div className="lg:col-span-7">
            <span className="latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
              {copy.kicker.toUpperCase()}
              <span aria-hidden="true" className="h-px w-12 bg-current" />
            </span>
            <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{copy.title}</h1>
          </div>
          <div className="lg:col-span-5">
            <p className="max-w-proseMax text-bodyLg leading-relaxed text-ink2">{copy.intro}</p>
            <p className="mt-2 text-body text-ink3">
              {countedIn(locale, houses.length, NOUN.house, editorialIn(locale))}
            </p>
          </div>
        </header>

        {houses.length === 0 ? (
          <p className="py-8 text-bodyLg text-ink2">{copy.none}</p>
        ) : (
          <Reveal className="mt-6 lg:mt-8">
            <HouseTable houses={houses} locale={locale} />
          </Reveal>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
