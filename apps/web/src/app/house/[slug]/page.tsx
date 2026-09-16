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
 * one object lit at scale because it is selling the idea of the catalogue; a
 * house opens with its name and its words, because it is selling itself. Two
 * screens that both shout are two screens that cancel each other out.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { counted, editorial, PERFUME } from '@diyar/i18n';
import { GOVERNORATE_AR } from '@diyar/i18n';
import type { Governorate } from '@diyar/domain';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { Track } from '@/features/analytics/Track';
import { findHouseBySlug } from '@/core/catalogue';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const house = await findHouseBySlug(slug);
  if (!house) return { title: 'ديار' };

  return {
    title: `${house.name} | ديار`,
    // The house's OWN words where it has them. A generated description on a
    // page about a maker is the one place a template sentence is most obvious.
    description: house.bio ?? `${house.name} — دار عطور مصرية مستقلّة على ديار.`,
    openGraph: { title: house.name, ...(house.bio ? { description: house.bio } : {}) },
  };
}

export default async function HousePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const house = await findHouseBySlug(slug);
  if (!house) notFound();

  return (
    <>
      <SiteHeader />

      {/* Which house was looked at, which is the whole value of this event.
          Keyed by slug — see the note on the product page. */}
      <Track key={house.slug} event="storefront_view" sellerId={house.id} />

      <main>
        {/* ------------------------------------------------------- the name */}
        <section className="border-b border-line/70">
          <div className="mx-auto max-w-contentMax px-5 pb-9 pt-8 lg:px-8 lg:pb-14 lg:pt-16">
            <Reveal>
              <div className="latin mb-4 text-micro tracking-label text-accent lg:mb-5 lg:text-caption">
                {house.latin}
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-display text-h1 leading-heading lg:text-displayLg">
                {house.name}
              </h1>
            </Reveal>

            {/*
              The facts, on one line, in the order a person asks them: where,
              since when, how many. Separated by a rule rather than commas
              because they are three answers, not a sentence.
            */}
            <Reveal delay={160}>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-ink3 lg:mt-7">
                {house.city && <span>{house.city}</span>}
                {house.foundedYear && (
                  <>
                    <span aria-hidden className="text-line">·</span>
                    {/* Editorial numerals: a founding year is prose, not data. */}
                    <span>منذ {editorial(house.foundedYear, false)}</span>
                  </>
                )}
                {house.products.length > 0 && (
                  <>
                    <span aria-hidden className="text-line">·</span>
                    <span>{counted(house.products.length, PERFUME, editorial)}</span>
                  </>
                )}
              </div>
            </Reveal>

            {house.bio && (
              <Reveal delay={240}>
                <p className="mt-6 max-w-proseMax text-bodyLg leading-relaxed text-ink2 lg:mt-8">
                  {house.bio}
                </p>
              </Reveal>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------ the story */}
        {house.story && (
          <section className="border-b border-line/70">
            {/*
              The same container as every other section, with the MEASURE
              constrained inside it.

              Centring a narrow column here instead put the story's right edge
              two hundred pixels inside the house's name, and a broken right
              margin is the first thing the eye finds on an RTL page — it reads
              as two pages stacked rather than one.
            */}
            <div className="mx-auto max-w-contentMax px-5 py-10 lg:px-8 lg:py-14">
              <div className="max-w-proseMax">
                <h2 className="mb-5 font-display text-h3 lg:text-h2Lg">الحكاية</h2>
                {/*
                  Paragraphs split on a blank line, the same rule the editorial
                  blocks follow. A house writes its story in a textarea and a
                  single newline there is a soft wrap, not a break.
                */}
                {house.story.split(/\n\s*\n/).map((paragraph, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <p key={index} className="mt-4 text-bodyLg leading-relaxed text-ink2">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* --------------------------------------------------- the perfumes */}
        <section className="mx-auto max-w-contentMax px-5 py-10 lg:px-8 lg:py-14">
          <h2 className="mb-7 font-display text-h3 lg:mb-9 lg:text-h2Lg">العطور</h2>

          {house.products.length === 0 ? (
            /*
             * A live house with nothing published yet.
             *
             * Said plainly rather than shown as an empty grid: an empty grid on
             * a page that otherwise works reads as a loading failure, and the
             * visitor refreshes instead of leaving.
             */
            <p className="text-bodyLg text-ink2">لا توجد عطور معروضة من هذه الدار حاليًا.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-9 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-14">
              {house.products.map((product, index) => (
                <Reveal key={product.id} delay={index * 60}>
                  <ProductTile product={product} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------ where it ships */}
        {house.serviceGovernorates.length > 0 && (
          <section className="border-t border-line/70">
            <div className="mx-auto max-w-contentMax px-5 py-9 lg:px-8 lg:py-11">
              <h2 className="mb-4 font-display text-h4">يوصّل إلى</h2>
              {/*
                Stated before checkout, not at it.

                Every house ships its own parcels, so coverage genuinely differs
                between them — and a customer discovering at the address step
                that their governorate is not served has spent the whole
                purchase for nothing.
              */}
              <p className="max-w-proseMax text-small leading-relaxed text-ink2">
                {house.serviceGovernorates
                  /* The column is a Postgres enum and the read model types it
                     as `string[]`, so the cast is where the two meet. `?? code`
                     covers a governorate added to the database ahead of the
                     copy layer — showing the code is ugly and showing nothing
                     is a lie about where the house delivers. */
                  .map((code) => GOVERNORATE_AR[code as Governorate] ?? code)
                  .join(' · ')}
              </p>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
