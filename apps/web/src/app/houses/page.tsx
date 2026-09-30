/**
 * Every house on the marketplace.
 *
 * Without this, a house was reachable only from a perfume — which means a
 * customer could find a maker only by first finding something they made. On a
 * marketplace whose argument is the makers, that is the wrong way round: the
 * question "who is on here?" had no answer at all.
 *
 * A list, not a grid of cards. Houses have no logos yet and inventing a tile
 * for each would mean three identical rectangles differing only in text — a
 * grid that carries no more than a list while claiming to.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { countedIn, editorialIn, HOUSES, NOUN, SHELL } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { localeHref } from '@/core/href';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
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

      <main className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[88px]">
        <header className="pb-8 pt-8 lg:pb-11 lg:pt-14">
          <div className="latin mb-4 text-micro tracking-label text-accent lg:mb-5 lg:text-caption">
            THE HOUSES
          </div>
          <h1 className="font-display text-h1 leading-heading lg:text-displayLg">{copy.title}</h1>
          <p className="mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2 lg:mt-7">
            {copy.intro}
          </p>
        </header>

        {houses.length === 0 ? (
          <p className="py-8 text-bodyLg text-ink2">{copy.none}</p>
        ) : (
          <ul className="border-t border-line">
            {houses.map((house, index) => (
              <li key={house.slug} className="border-b border-line">
                <Reveal delay={index * 60}>
                  <Link
                    href={localeHref(locale, `/house/${house.slug}`)}
                    className="tappable group flex min-h-touch flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-6 lg:py-8"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="font-display text-h3 transition-colors duration-base ease-out group-hover:text-accent lg:text-h2Lg">
                        {house.name}
                      </span>
                      <span className="latin text-micro tracking-label text-accent lg:text-caption">
                        {house.latin}
                      </span>
                    </span>

                    <span className="flex items-baseline gap-x-4 text-caption text-ink3">
                      {house.city && <span>{house.city}</span>}
                      {/* Through `counted`: Arabic inflects a counted noun six
                          ways, and "١ عطر" is not one of them. */}
                      <span>{countedIn(locale, house.count, NOUN.perfume, editorialIn(locale))}</span>
                    </span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
