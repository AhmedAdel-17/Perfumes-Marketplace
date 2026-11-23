import Link from 'next/link';
import { countedIn, data as num, editorialIn, HOUSES, langAttrs, languageOf, NOUN, pick, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { Reveal } from '@/features/shell/Reveal';

export interface HouseLine {
  slug: string;
  name: string;
  nameEn: string | null;
  city: string | null;
  foundedYear: number | null;
  count: number;
}

/**
 * The houses as an index of names (identity v3, 16 Nov 2026) — replacing the
 * four-column table on the customer pages.
 *
 * The marketplace is named for its houses (ديار is the plural of دار) and
 * printed them at the size of a table cell. Here each house is a line a
 * visitor can read from across the room: its number, its name at headline
 * size, and — at the end of the line, in the small voice — where it works,
 * since when, and how much it shows. The whole line is the link.
 *
 * Under the pointer the name takes the accent, steps forward a little, and the
 * arrow at the far end draws out: one move, in the reading direction.
 *
 * NO RATING: there is no per-house aggregate of reviews, and a figure that
 * is not measured is not printed. NO VERIFICATION MARK: the same mark on every
 * line is the platform describing its own process to buyers (founder, 17 Oct
 * 2026). (Replaces `HouseTable`, identity v2's four-column table.)
 */
export function HouseIndex({ houses, locale }: { houses: readonly HouseLine[]; locale: Locale }) {
  const copy = HOUSES[locale];
  const say = editorialIn(locale);
  return (
    <ol className="house-index -mt-7 lg:-mt-8">
      {houses.map((house, i) => {
        const name = pick(locale, house.name, house.nameEn);
        return (
          <Reveal as="li" key={house.slug} delay={Math.min(i, 5) * 60} className="border-b border-line">
            <Link
              href={localeHref(locale, `/house/${house.slug}`)}
              className="house-line group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1 py-5 lg:grid-cols-[56px_1fr_auto_auto] lg:gap-x-8 lg:py-7"
            >
              <span aria-hidden="true" className="latin tnum text-small text-ink3">{num(i + 1).padStart(2, '0')}</span>
              <span
                {...langAttrs(locale, name.lang)}
                className="house-name font-display text-h2 leading-heading group-hover:text-accent lg:text-h1Lg"
              >
                {name.text}
              </span>
              <span className="col-start-2 text-small text-ink2 lg:col-start-auto lg:text-body">
                {house.city && <span {...langAttrs(locale, languageOf(house.city))}>{house.city}</span>}
                {house.city && house.foundedYear ? ' · ' : ''}
                {house.foundedYear ? copy.since(say(house.foundedYear, false)) : ''}
                <span className="lg:hidden">
                  {' · '}
                  {countedIn(locale, house.count, NOUN.perfume, say)}
                </span>
              </span>
              <span className="row-start-1 col-start-3 flex items-center gap-5 self-center lg:row-start-auto lg:col-start-auto">
                <span className="hidden min-w-[88px] text-end text-body text-ink2 lg:block">
                  {countedIn(locale, house.count, NOUN.perfume, say)}
                </span>
                <svg
                  aria-hidden="true"
                  width="28" height="10" viewBox="0 0 28 10" fill="none" stroke="currentColor" strokeWidth="1.2"
                  className="house-arrow text-ink3 group-hover:text-accent rtl:-scale-x-100"
                >
                  <path d="M0 5h27M23 1l4 4-4 4" />
                </svg>
              </span>
            </Link>
          </Reveal>
        );
      })}
    </ol>
  );
}
