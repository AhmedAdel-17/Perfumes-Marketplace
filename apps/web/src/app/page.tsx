import Link from 'next/link';
import { findHouseBySlug, findProductBySlug, listHouses, listPublishedProducts } from '@/core/catalogue';
import { api } from '@/core/api';
import { SpecimenCard } from '@/features/catalogue/SpecimenCard';
import { HouseTable } from '@/features/catalogue/HouseTable';
import { NoteIndex } from '@/features/home/NoteIndex';
import { SectionHead } from '@/features/shell/SectionHead';
import { Specimen } from '@/features/home/Specimen';
import { VerificationChecks } from '@/features/home/VerificationChecks';
import { primarySurface } from '@/features/shell/primary-surface';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { arrivalWindow } from '@diyar/api';
import { data as num, HOME } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

export const dynamic = 'force-dynamic';

/** How many perfumes the register section shows: one row of four at desktop. */
const REGISTER_SIZE = 4;

/**
 * The home page — visual identity v2, on design-reference/redesign/04-laboratoire.html.
 *
 * A numbered register, top to bottom: the claim and its proof (01), how a
 * house gets in (02), what is in (03), how to look by note (04), and who the
 * houses are (05). The idea the identity is built on is that the catalogue's
 * schema IS the look, so every section prints real rows — nothing here is a
 * picture of a fact the database does not hold.
 */
export default async function Home() {
  const locale = await getLocale();
  const copy = HOME[locale];

  const [products, curation, houses, notes] = await Promise.all([
    listPublishedProducts(),
    api().site.curation(),
    listHouses(),
    api().catalogue.noteIndex({ perTier: 5 }),
  ]);

  /*
   * Which perfume opens the site is a DECISION — the operators' (`/ops/site`).
   * Without one, the most recently published perfume that can be BOUGHT: the
   * specimen carries an Add to bag, and opening the site on a disabled button
   * reads as a shop that is closed. Only an operator can choose to feature a
   * perfume that is out of stock. A curated perfume that has since been
   * unpublished falls back too, rather than 404ing the front door.
   */
  const hero = (curation.heroProductId && products.find((p) => p.id === curation.heroProductId))
    || products.find((p) => p.inStock)
    || products[0];
  const heroDetail = hero ? await findProductBySlug(hero.slug) : null;
  const heroHouse = heroDetail?.houseSlug ? await findHouseBySlug(heroDetail.houseSlug) : null;

  /*
   * Section 03 is the operators' selection when they have made one, and the
   * newest perfumes when they have not — under a title that says which. The
   * curation control in /ops/site must keep doing something visible, and a
   * "recently registered" heading over a hand-picked list would be untrue.
   */
  const featured = curation.featuredProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const selected = featured.length > 0;
  const register = (selected ? featured : products.filter((p) => p.id !== hero?.id)).slice(0, REGISTER_SIZE);
  const ratings = register.length > 0
    ? await api().reviews.summaries({ productIds: register.map((p) => p.id) })
    : {};

  // The page lists exactly the controls the database enforces — a test holds
  // the copy to the enum — so their count is the stamp's denominator.
  const controls = Object.keys(copy.checks).length;

  return (
    <>
      <SiteHeader />

      {/* The top of the funnel: somebody arrived. Renders nothing. */}
      <Track event="landing_view" />

      <main>
        {/* ------------------------------------------------------- 01 opening */}
        <div className="mx-auto grid max-w-contentMax items-center gap-8 px-5 py-8 lg:grid-cols-[1.15fr_.85fr] lg:gap-[88px] lg:px-8 lg:py-[88px]">
          <Reveal>
            <span className="latin flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
              {copy.kicker.toUpperCase()}
              <span aria-hidden="true" className="h-px w-12 bg-current" />
            </span>
            {/*
              Arabic display type wants room between lines that Latin does not:
              1.2 for Arabic, 1.02 for the English serif (CLAUDE.md §15 — set the
              scale for Arabic first). The accent line is italic only where the
              face has one worth showing: Newsreader on paper, not Archivo's
              condensed capitals on Noir.
            */}
            <h1 className="mt-5 font-display text-h1Lg leading-[1.2] lg:mt-6 lg:text-displayLg [html[lang=en]_&]:leading-[1.02] xl:text-displayXl">
              {copy.headline}
              <br />
              <em className="not-italic text-accent [html[lang=en]:not([data-theme=dark])_&]:italic">{copy.headlineAccent}</em>
            </h1>
            <p className="mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2 lg:mt-6 lg:text-h4">{copy.lede}</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 lg:mt-8">
              <Link href={localeHref(locale, '/search')} className={`${primarySurface} px-6`}>
                {copy.browse}
                <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="rtl:-scale-x-100">
                  <path d="M0 5h17M13 1l4 4-4 4" />
                </svg>
              </Link>
              <a href="#standard" className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent">
                <span className="border-b border-current">{copy.howWeVerify}</span>
              </a>
            </div>
          </Reveal>

          {heroDetail && (
            <Reveal delay={120} className="w-full max-w-[520px] lg:max-w-none">
              <Specimen
                product={heroDetail}
                house={heroHouse}
                locale={locale}
                total={controls}
                arrival={arrivalWindow(heroDetail.fulfilmentHours)}
              />
            </Reveal>
          )}
        </div>

        {/* -------------------------------------------------- 02 the standard */}
        <section aria-labelledby="standard" className="mx-auto max-w-contentMax px-5 py-8 lg:px-8 lg:py-[104px]">
          <Reveal>
            <SectionHead id="standard" index={copy.checksIndex} title={copy.checksTitle} />
          </Reveal>
          <Reveal>
            <VerificationChecks locale={locale} />
          </Reveal>
        </section>

        {/* -------------------------------------------------- 03 the register */}
        <section aria-labelledby="register" className="mx-auto max-w-contentMax px-5 pb-8 lg:px-8 lg:pb-[104px]">
          <Reveal>
            <SectionHead
              id="register"
              index={copy.recentIndex}
              title={selected ? copy.selectedTitle : copy.recentTitle}
              link={products.length > 0
                ? { href: localeHref(locale, '/search'), label: copy.fullRegister(num(products.length)) }
                : undefined}
            />
          </Reveal>
          {products.length === 0 ? (
            /* Day one is a real state, not an edge case: the catalogue is empty
               until the first house clears verification. */
            <p className="py-8 text-body text-ink3">{copy.empty}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              {register.map((product, i) => (
                <Reveal as="li" key={product.id} delay={Math.min(i, 3) * 90}>
                  <SpecimenCard product={product} locale={locale} rating={ratings[product.id]} />
                </Reveal>
              ))}
            </ul>
          )}
        </section>

        {/* ----------------------------------------------------- 04 the notes */}
        {(notes.top.length > 0 || notes.heart.length > 0 || notes.base.length > 0) && (
          <section aria-labelledby="notes" className="mx-auto max-w-contentMax px-5 pb-8 lg:px-8 lg:pb-[104px]">
            <Reveal>
              <SectionHead id="notes" index={copy.notesIndex} title={copy.notesTitle} />
            </Reveal>
            <Reveal>
              <NoteIndex index={notes} locale={locale} />
            </Reveal>
          </section>
        )}

        {/* ---------------------------------------------------- 05 the houses */}
        {houses.length > 0 && (
          <section aria-labelledby="houses" className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[104px]">
            <Reveal>
              <SectionHead
                id="houses"
                index={copy.housesIndex}
                title={copy.housesTitle}
                link={{ href: localeHref(locale, '/houses'), label: copy.allHouses }}
              />
            </Reveal>
            <Reveal>
              <HouseTable houses={houses} locale={locale} />
            </Reveal>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
