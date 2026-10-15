/**
 * A house, and everything it sells.
 *
 * THE SCREEN THIS MARKETPLACE WAS MISSING. Its entire proposition is that these
 * are named, independent Egyptian houses rather than anonymous stock — and a
 * customer could read a house's name on a bottle and then had nowhere to go. A
 * marketplace where the maker is not a destination is a marketplace where the
 * maker is a supplier, which is the opposite of what doc 01 describes.
 *
 * `bio`, `story`, `founded_year`, `city` and `service_governorates` have been on
 * the sellers table since migration 0000, written by nobody and read by nobody.
 *
 * The composition is deliberately NOT the homepage's. The home page opens with
 * a specimen because it is selling the idea of the register; a house opens with
 * its name and its words, because it is selling itself.
 *
 * Visual identity v2: beside the words, the house's own LABEL — the same ruled
 * rows as a perfume's specimen sheet (city, founding year, perfumes,
 * verification, where it delivers), so a house is read the way a perfume is.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  data as num, editorialIn, GOVERNORATE, HOUSES, langAttrs, languageOf, pick, SHELL,
} from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import type { Governorate } from '@diyar/domain';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { SpecimenCard, type CardRating } from '@/features/catalogue/SpecimenCard';
import { VERIFICATION_CONTROLS } from '@/features/catalogue/HouseTable';
import { SectionHead } from '@/features/shell/SectionHead';
import { api } from '@/core/api';
import { Track } from '@/features/analytics/Track';
import { findHouseBySlug } from '@/core/catalogue';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const house = await findHouseBySlug(slug);
  const locale = await getLocale();
  const suffix = SHELL[locale].titleSuffix;
  if (!house) return { title: suffix };

  const name = pick(locale, house.name, house.nameEn).text;
  const bio = pick(locale, house.bio ?? '', house.bioEn).text || null;
  return {
    title: `${name} | ${suffix}`,
    // The house's OWN words where it has them. A generated description on a
    // page about a maker is the one place a template sentence is most obvious.
    description: bio ?? HOUSES[locale].houseFallbackDescription(name),
    openGraph: { title: name, ...(bio ? { description: bio } : {}) },
  };
}

export default async function HousePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const house = await findHouseBySlug(slug);
  if (!house) notFound();
  const locale = await getLocale();
  const copy = HOUSES[locale];
  const name = pick(locale, house.name, house.nameEn);
  const bio = house.bio ? pick(locale, house.bio, house.bioEn) : null;
  const story = house.story ? pick(locale, house.story, house.storyEn) : null;

  // Ratings for its perfumes, in batches of sixty — see the search page.
  const ids = house.products.map((p) => p.id);
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) batches.push(ids.slice(i, i + 60));
  const ratings: Record<string, CardRating> = Object.assign(
    {},
    ...(await Promise.all(batches.map((productIds) => api().reviews.summaries({ productIds })))),
  );

  // Sections are numbered in the order they appear, so a house with no story
  // does not open its register at 02.
  let section = 0;
  const next = () => String(++section).padStart(2, '0');

  return (
    <>
      <SiteHeader />

      {/* Which house was looked at, which is the whole value of this event.
          Keyed by slug — see the note on the product page. */}
      <Track key={house.slug} event="storefront_view" sellerId={house.id} />

      <main className="mx-auto max-w-contentMax px-5 pb-9 lg:px-8 lg:pb-[104px]">
        {/* ------------------------------------------------ the name and label */}
        <div className="grid gap-8 border-b border-ink pb-8 pt-8 lg:grid-cols-12 lg:gap-8 lg:pb-12 lg:pt-12">
          <div className="lg:col-span-7">
            <Reveal>
              <span className="latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
                {[copy.verifiedHouse, house.foundedYear ? copy.established(String(house.foundedYear)) : null]
                  .filter(Boolean).join(' · ').toUpperCase()}
                <span aria-hidden="true" className="h-px w-12 bg-current" />
              </span>
              <h1 {...langAttrs(locale, name.lang)} className="font-display text-h1 leading-heading lg:text-displayLg">
                {name.text}
              </h1>
            </Reveal>
            {bio && (
              <Reveal delay={120}>
                <p {...langAttrs(locale, bio.lang)} className="mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2 lg:mt-7 lg:text-h4">
                  {bio.text}
                </p>
              </Reveal>
            )}
          </div>

          {/*
            The house's label. Verification is printed because it is true of
            every house that has a page at all: `houseBySlug` returns only live
            houses, and migration 0001's gate puts none live short of all eight
            controls.

            "Delivers to" is here rather than in a section at the foot of the
            page: it is stated BEFORE the perfumes, because every house ships
            its own parcels, coverage genuinely differs between them, and a
            customer discovering at the address step that their governorate is
            not served has spent the whole purchase for nothing.
          */}
          <Reveal delay={160} className="lg:col-span-5">
            <section aria-labelledby="house-label" className="border border-ink bg-raised">
              <h2 id="house-label" className="latin border-b border-ink px-4 py-2 text-micro tracking-label text-ink2">
                {copy.houseLabel.toUpperCase()}
              </h2>
              <dl className="text-body lg:text-bodyLg">
                {house.city && (
                  <Row label={copy.columns.city}>
                    <span {...langAttrs(locale, languageOf(house.city))}>{house.city}</span>
                  </Row>
                )}
                {house.foundedYear && (
                  // Editorial numerals: a founding year is prose by kind.
                  <Row label={copy.founded}>{editorialIn(locale)(house.foundedYear, false)}</Row>
                )}
                <Row label={copy.columns.perfumes}><span className="tnum">{num(house.products.length)}</span></Row>
                <Row label={copy.columns.verification}>
                  <span className="inline-flex items-center gap-2 text-accent">
                    <span aria-hidden="true" className="inline-flex gap-[2px]">
                      {Array.from({ length: VERIFICATION_CONTROLS }, (_, i) => <i key={i} className="h-3 w-1.5 bg-accent" />)}
                    </span>
                    <span>{copy.verifiedChecks(num(VERIFICATION_CONTROLS), num(VERIFICATION_CONTROLS))}</span>
                  </span>
                </Row>
                {house.serviceGovernorates.length > 0 && (
                  <Row label={copy.deliversTo}>
                    {house.serviceGovernorates
                      /* The column is a Postgres enum and the read model types it
                         as `string[]`, so the cast is where the two meet. `?? code`
                         covers a governorate added to the database ahead of the
                         copy layer — showing the code is ugly and showing nothing
                         is a lie about where the house delivers. */
                      .map((code) => GOVERNORATE[locale][code as Governorate] ?? code)
                      .join(' · ')}
                  </Row>
                )}
              </dl>
            </section>
          </Reveal>
        </div>

        {/* ------------------------------------------------------ the story */}
        {story && (
          <section aria-labelledby="story" className="mt-9 lg:mt-[104px]">
            <SectionHead id="story" index={next()} title={copy.story} />
            {/*
              The MEASURE is constrained, not the container: centring a narrow
              column put the story's right edge two hundred pixels inside the
              house's name, and a broken right margin is the first thing the eye
              finds on an RTL page.

              Paragraphs split on a blank line, the same rule the editorial
              blocks follow. A house writes its story in a textarea and a
              single newline there is a soft wrap, not a break.
            */}
            <div className="max-w-proseMax">
              {story.text.split(/\n\s*\n/).map((paragraph, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <p key={index} {...langAttrs(locale, story.lang)} className="mt-4 text-bodyLg leading-relaxed text-ink2 first:mt-0">
                  {paragraph.trim()}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* --------------------------------------------------- the perfumes */}
        <section aria-labelledby="perfumes" className="mt-9 lg:mt-[104px]">
          <SectionHead id="perfumes" index={next()} title={copy.perfumes} />
          {house.products.length === 0 ? (
            /*
             * A live house with nothing published yet.
             *
             * Said plainly rather than shown as an empty grid: an empty grid on
             * a page that otherwise works reads as a loading failure, and the
             * visitor refreshes instead of leaving.
             */
            <p className="text-bodyLg text-ink2">{copy.noPerfumes}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              {house.products.map((product, index) => (
                <Reveal as="li" key={product.id} delay={Math.min(index, 6) * 60}>
                  <SpecimenCard product={product} locale={locale} rating={ratings[product.id]} />
                </Reveal>
              ))}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 border-b border-line px-4 py-3 last:border-b-0 lg:grid-cols-[120px_1fr]">
      <dt className="text-ink3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
