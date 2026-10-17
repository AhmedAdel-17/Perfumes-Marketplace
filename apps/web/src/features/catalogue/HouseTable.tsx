import Link from 'next/link';
import { data as num, editorialIn, HOUSES, langAttrs, languageOf, pick, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';

export interface HouseLine {
  slug: string;
  name: string;
  nameEn: string | null;
  city: string | null;
  foundedYear: number | null;
  count: number;
}

/**
 * The houses as a table (identity v2 — the houses `table` in
 * 04-laboratoire.html): who they are, where, since when, and how much they sell.
 *
 * NO RATING COLUMN, unlike the reference. There is no per-house aggregate of
 * reviews, and a column of dashes would announce a measurement the platform
 * does not make. It comes back when a house-level rating exists.
 *
 * NO VERIFICATION COLUMN since 17 Oct 2026. It printed the same 8/8 bar on
 * every row — the platform describing its own process to buyers. The founder
 * had the customer pages speak only to customers.
 *
 * Founding year and count step aside below `sm`; the name and the city are
 * what a phone needs, and the house page has the rest.
 *
 * Shared by the home page's register and the directory, so a house reads the
 * same in both places.
 */

export function HouseTable({ houses, locale }: { houses: readonly HouseLine[]; locale: Locale }) {
  const copy = HOUSES[locale];
  const head = 'pb-3 pe-3 text-start font-normal text-ink3';
  const cell = 'border-t border-line py-4 pe-3';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body lg:text-bodyLg">
        <thead>
          <tr className={locale === 'en' ? 'latin text-micro uppercase tracking-label' : 'text-small'}>
            <th scope="col" className={head}>{copy.columns.house}</th>
            <th scope="col" className={head}>{copy.columns.city}</th>
            <th scope="col" className={`${head} hidden sm:table-cell`}>{copy.columns.since}</th>
            <th scope="col" className={`${head} hidden sm:table-cell`}>{copy.columns.perfumes}</th>
          </tr>
        </thead>
        <tbody>
          {houses.map((house) => {
            const name = pick(locale, house.name, house.nameEn);
            return (
              <tr key={house.slug} className="transition-colors duration-quick ease-out hover:bg-raised">
                <td className={cell}>
                  <Link
                    href={localeHref(locale, `/house/${house.slug}`)}
                    {...langAttrs(locale, name.lang)}
                    className="tappable inline-flex min-h-touch items-center font-display text-h4 transition-colors duration-base ease-out hover:text-accent lg:text-h3"
                  >
                    {name.text}
                  </Link>
                </td>
                <td className={cell}>
                  {house.city && <span {...langAttrs(locale, languageOf(house.city))}>{house.city}</span>}
                </td>
                {/* Editorial numerals: a founding year is prose by KIND, wherever
                    it is printed (numerals.ts). The count beside it is data. */}
                <td className={`${cell} hidden tnum sm:table-cell`}>{house.foundedYear ? editorialIn(locale)(house.foundedYear, false) : ''}</td>
                <td className={`${cell} hidden tnum sm:table-cell`}>{num(house.count)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
