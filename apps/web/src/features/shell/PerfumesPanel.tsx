import Link from 'next/link';
import { SCENT_FAMILIES } from '@diyar/domain';
import { langAttrs, languageOf, pick, SCENT_FAMILY, SHELL, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { listHouses } from '@/core/catalogue';

/**
 * The Perfumes panel — the masthead's map of the shop (header concept 02,
 * "Atomiseur", chosen by the founder 17 Oct 2026).
 *
 * The scent FAMILIES as a rack of vials, each holding its own colour, beside
 * the houses. It teaches the catalogue's own vocabulary — oud, amber, woody… —
 * before the visitor has typed a word, and every vial is a real door: the
 * catalogue filtered to that family. Hover a vial and its liquid rises.
 *
 * Server-rendered and handed to MastheadNav as a slot, so the house list comes
 * from the same memoised query the houses directory uses, and the client
 * bundle carries no catalogue data. Shown from `lg` only: below it there is no
 * hover, and the Perfumes link simply goes to the catalogue.
 *
 * The family colours are the scent-family tokens: liquid in a drawing of
 * glass, a picture of a thing (tailwind-preset `family`), not chrome.
 */
const LIQUID: Record<(typeof SCENT_FAMILIES)[number], string> = {
  oud: 'fill-family-oud',
  amber: 'fill-family-amber',
  woody: 'fill-family-woody',
  floral: 'fill-family-floral',
  fresh: 'fill-family-fresh',
  gourmand: 'fill-family-gourmand',
  musk: 'fill-family-musk',
};

/** How many houses the panel names before "all houses" takes over. */
const HOUSES_SHOWN = 6;

export async function PerfumesPanel({ locale }: { locale: Locale }) {
  const copy = SHELL[locale];
  const houses = (await listHouses()).slice(0, HOUSES_SHOWN);

  const kicker = 'latin mb-6 flex items-center gap-3 text-caption tracking-label text-accent';

  return (
    <div className="mast-panel" aria-label={copy.perfumesPanel} role="region">
      <div className="mx-auto grid max-w-contentMax grid-cols-[1fr_320px] gap-[72px] px-8 pb-11 pt-10">
        <div>
          <p className={kicker}>
            {copy.familiesKicker.toUpperCase()}
            <span aria-hidden="true" className="h-px w-12 bg-current" />
          </p>
          <ul className="grid grid-cols-7 gap-2">
            {SCENT_FAMILIES.map((family) => (
              <li key={family} className="vial">
                <Link
                  href={localeHref(locale, `/search?family=${family}`)}
                  className="flex flex-col items-center gap-3 py-2"
                >
                  <svg viewBox="0 0 46 96" aria-hidden="true" className="h-[96px] w-[46px] overflow-visible">
                    <rect className={`vial-liquid ${LIQUID[family]}`} x="7" y="34" width="32" height="57" />
                    <path
                      className="fill-none stroke-ink"
                      strokeWidth="1"
                      d="M17 4h12v10h-12z M15 14h16v8l8 8v62H7V30l8-8z"
                    />
                  </svg>
                  <span className="vial-name font-display text-h4">{SCENT_FAMILY[locale][family]}</span>
                  <span lang="en" className="latin text-micro tracking-label text-ink3">
                    {SCENT_FAMILY.en[family].toUpperCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={kicker}>
            {copy.housesKicker.toUpperCase()}
            <span aria-hidden="true" className="h-px w-12 bg-current" />
          </p>
          <ul className="border-t border-line">
            {houses.map((house) => {
              const name = pick(locale, house.name, house.nameEn);
              return (
                <li key={house.slug} className="flex items-baseline justify-between gap-4 border-b border-line">
                  <Link
                    href={localeHref(locale, `/house/${house.slug}`)}
                    {...langAttrs(locale, name.lang)}
                    className="flex min-h-touch items-center font-display text-h4 transition-colors duration-base ease-out hover:text-accent"
                  >
                    {name.text}
                  </Link>
                  {house.city && (
                    <span {...langAttrs(locale, languageOf(house.city))} className="text-small text-ink3">
                      {house.city}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex gap-7">
            <Link href={localeHref(locale, '/houses')} className="inline-flex min-h-touch min-w-touch items-center text-body">
              <span className="link-line">{copy.allHouses}</span>
            </Link>
            <Link href={localeHref(locale, '/search')} className="inline-flex min-h-touch min-w-touch items-center text-body">
              <span className="link-line">{copy.allPerfumes}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
