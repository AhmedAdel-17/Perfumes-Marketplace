import Link from 'next/link';
import { data as num, languageOf, HOME, langAttrs, pick, type Locale } from '@diyar/i18n';
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
 * The houses as a register table (identity v2 — the houses `table` in
 * 04-laboratoire.html): who they are, where, since when, how much they sell,
 * and how they were verified.
 *
 * NO RATING COLUMN, unlike the reference. There is no per-house aggregate of
 * reviews, and a column of dashes would announce a measurement the platform
 * does not make. It comes back when a house-level rating exists.
 *
 * The verification column is the same for every row, and that is the point
 * rather than a waste: only a house that passed all eight controls is live
 * (migration 0001's gate), and seeing a full bar on every row is how a visitor
 * learns that there is no other kind of house here.
 *
 * Founding year and count step aside below `sm`; the name, the city and the
 * verification are what a phone needs, and the house page has the rest.
 */
export function HouseTable({ houses, locale, total }: { houses: readonly HouseLine[]; locale: Locale; total: number }) {
  const copy = HOME[locale];
  const head = 'pb-3 pe-3 text-start font-normal text-ink3';
  const cell = 'border-t border-line py-4 pe-3';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body lg:text-bodyLg">
        <thead>
          <tr className={locale === 'en' ? 'latin text-micro uppercase tracking-label' : 'text-small'}>
            <th scope="col" className={head}>{copy.house}</th>
            <th scope="col" className={head}>{copy.city}</th>
            <th scope="col" className={`${head} hidden sm:table-cell`}>{copy.since}</th>
            <th scope="col" className={`${head} hidden sm:table-cell`}>{copy.perfumes}</th>
            <th scope="col" className={head}>{copy.verification}</th>
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
                <td className={`${cell} hidden tnum sm:table-cell`}>{house.foundedYear ? num(house.foundedYear, false) : ''}</td>
                <td className={`${cell} hidden tnum sm:table-cell`}>{num(house.count)}</td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-2 text-small text-accent">
                    <span aria-hidden="true" className="inline-flex gap-[2px]">
                      {Array.from({ length: total }, (_, i) => <i key={i} className="h-3 w-1.5 bg-accent" />)}
                    </span>
                    <span aria-hidden="true" className="latin tnum">{total}/{total}</span>
                    <span className="sr-only">{copy.verifiedChecks(num(total), num(total))}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
