import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProductBySlug, listPublishedProducts } from '@/core/catalogue';
import { NotesPyramid } from '@/features/product/NotesPyramid';
import { EvolutionCurve } from '@/features/product/EvolutionCurve';
import { PerformanceMeter } from '@/features/product/PerformanceMeter';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { BuyBlock } from '@/features/product/BuyBlock';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { ProductReviews } from '@/features/reviews/ProductReviews';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { arrivalWindow } from '@diyar/api';
import {
  CONCENTRATION, data as num, labelOf, langAttrs, NOUN, nounIn, pick, PRODUCT, SHELL,
} from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { localeHref } from '@/core/href';

export const dynamic = 'force-dynamic';

/**
 * Server-rendered with metadata and product structured data.
 *
 * CLAUDE.md §14: storefronts and product pages are an acquisition surface —
 * sellers link to them from social bios — so they must render on the server and
 * carry real metadata rather than being assembled in the browser.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const product = await findProductBySlug(slug);
  const locale = await getLocale();
  const copy = PRODUCT[locale];
  if (!product) return { title: copy.notFound };
  const name = pick(locale, product.name, product.nameEn).text;
  const house = pick(locale, product.brandName, product.brandNameEn).text;

  return {
    title: `${name} — ${house} | ${SHELL[locale].titleSuffix}`,
    description: copy.metaDescription(
      name, house,
      labelOf(CONCENTRATION, locale, product.concentration), String(product.volumeMl),
    ),
    openGraph: {
      title: `${name} — ${house}`,
      type: 'website',
      locale: locale === 'ar' ? 'ar_EG' : 'en_GB',
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await findProductBySlug(slug);
  if (!product) notFound();

  const others = (await listPublishedProducts()).filter((p) => p.slug !== slug).slice(0, 4);
  // The SAME window the bag, the checkout and the confirmation quote. This page
  // used to compute its own and promised a day earlier than every screen after
  // it — see `arrivalWindow`.
  const arrival = arrivalWindow(product.fulfilmentHours);
  const locale = await getLocale();
  const copy = PRODUCT[locale];
  const name = pick(locale, product.name, product.nameEn);
  const house = pick(locale, product.brandName, product.brandNameEn);

  return (
    <>
      <SiteHeader />

      {/*
        The view that the funnel turns on: "looked at this perfume" is the stage
        before "put it in a bag". Renders nothing.

        `key` is the product id, and it is load-bearing. Moving from one perfume
        to another is a client-side navigation that keeps this component in the
        same position with the same type, so React REUSES it — and its
        already-fired guard would then swallow every view after the first. With
        the key, a different perfume mounts a different tracker.
      */}
      <Track key={product.id} event="product_view" productId={product.id} />

      <main className="pb-[92px] lg:pb-0">
        {/*
            Below 1024 the page is the phone design, capped so a tablet gets a
            comfortable centred column instead of a 900px-wide stretch of what
            was drawn for 390px. The two-column layout starts where there is
            genuinely room for two columns, not one pixel earlier.
          */}
        <div className="mx-auto max-w-phoneMax lg:max-w-contentMax lg:px-8 lg:pt-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            {/* ------------------------------------------------------ media
                In RTL the first grid child lands on the RIGHT, which is where
                the eye starts — so the bottle leads and the copy follows it,
                the same order a phone reads top to bottom. */}
            <div className="lg:col-span-7">
              <div className="lg:sticky lg:top-[100px]">
                {/*
                  A lit scene, in four layers: an ambient ground, a warm key
                  light above and behind the flacon, the flacon itself, and a
                  vignette that closes the corners. Collapse these into one
                  gradient and the panel goes flat — which is exactly what it
                  did before.
                */}
                {/* Dark in both themes, and deliberately NOT scoped with
                    `data-theme`: nothing inside paints with a colour role — the
                    stage is literal gradients and the flacon's own glass — while
                    the fade at its foot must continue the PAGE ground, which on
                    paper is paper. Scoping the plate would have made that fade
                    noir and put back the seam it exists to remove. */}
                <div className="relative h-[408px] overflow-hidden lg:h-[664px] lg:rounded-sm">
                  <div className="absolute inset-0 bg-[radial-gradient(72%_58%_at_50%_22%,theme(colors.stage.glow)_0%,theme(colors.stage.mid)_46%,theme(colors.stage.deep)_84%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(38%_30%_at_50%_10%,rgba(206,168,100,.16),transparent_74%)]" />

                  {product.photo ? (
                    /*
                     * The house's own photograph, full-bleed on the plate. The
                     * vignette and the foot fade below still apply, so a real
                     * photograph sits in the same lit scene the illustration did
                     * and the title reads over it on a phone. `priority`: this is
                     * the largest paint on the page.
                     */
                    <ProductPhoto
                      photo={product.photo}
                      priority
                      sizes="(min-width: 1024px) 58vw, 100vw"
                    />
                  ) : (
                    <Reveal className="absolute inset-0 flex items-start justify-center pt-3 lg:items-center lg:pt-0">
                      <Flacon
                        family={product.family}
                        house={product.brandLatin}
                        uid={`hero-${product.id}`}
                        className="h-[80%] w-auto drop-shadow-[0_34px_64px_rgba(0,0,0,.55)] lg:h-[92%]"
                      />
                    </Reveal>
                  )}

                  <div className="absolute inset-0 bg-[radial-gradient(124%_104%_at_50%_44%,transparent_40%,rgba(6,5,5,.58)_100%)]" />

                  {/* Fades the plate into the page so the title can sit over it
                      on a phone without a hard seam. */}
                  {/*
                      The fade exists ONLY to give the overlaid title a ground to
                      sit on, so it is measured in PIXELS from the bottom, not in
                      percentages of the plate. As a percentage it climbed a third
                      of the way up the image and swallowed the flacon's base and
                      cast shadow — the two things that make the object sit on a
                      surface rather than float. */}
                  <div
                    className="absolute inset-0 lg:hidden"
                    style={{
                      // Built from the THEME: this fade exists to continue the
                      // page background, so if that background ever moves — a
                      // new palette, the other theme — and this does not, the
                      // seam becomes visible.
                      backgroundImage:
                        'linear-gradient(to top,rgb(var(--c-ground)) 0px,rgb(var(--c-ground)) 44px,' +
                        'rgb(var(--c-ground) / .87) 82px,transparent 142px)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------- details */}
            <div className="lg:col-span-5">
              {/* On a phone this block is pulled UP over the gradient above,
                  which gives the overlaid title of the original design with a
                  single h1 in the document rather than one per breakpoint. */}
              <div className="relative z-10 -mt-[84px] px-5 lg:mt-0 lg:px-0">
                <div className="latin mb-2 text-caption tracking-label text-accent">
                  {product.brandLatin}
                </div>
                <h1
                  {...langAttrs(locale, name.lang)}
                  className="font-display text-h1 leading-[1.1] tracking-tight lg:text-displayLg"
                >
                  {name.text}
                </h1>
                <p className="mt-2 text-small text-ink2 lg:mt-3 lg:text-bodyLg">
                  <span className="tnum">{num(product.volumeMl)}</span> {copy.ml} · {labelOf(CONCENTRATION, locale, product.concentration)}
                </p>
              </div>

              <div className="px-5 lg:px-0">
                <div className="mt-7 lg:mt-8">
                  <BuyBlock
                    productId={product.id}
                    pricePiastres={product.pricePiastres}
                    inStock={product.inStock}
                    variant="inline"
                    locale={locale}
                  />
                </div>

                {/* ------------------------------------------------- pyramid */}
                <div className="pt-6 lg:pt-8">
                  <NotesPyramid
                    top={product.notesTop}
                    heart={product.notesHeart}
                    base={product.notesBase}
                    english={product.noteEnglish}
                    locale={locale}
                  />
                </div>

              </div>
            </div>
          </div>

          {/*
            Below the split, full width.

            The evolution curve, the performance bands and the house block used
            to sit inside the 5-of-12 detail column, which made that column run
            four times the height of the media beside it and squeezed a
            time-series chart into 380 pixels. A chart of eight hours needs
            width more than any other element on this page, and the column it
            was in was the narrowest place available.
          */}
          <div className="mt-8 px-5 lg:mt-[72px] lg:grid lg:grid-cols-12 lg:gap-8 lg:px-0">
            <div className="lg:col-span-7">
              <EvolutionCurve
                topCount={product.notesTop.length}
                heartCount={product.notesHeart.length}
                baseCount={product.notesBase.length}
                locale={locale}
              />
            </div>

            <div className="lg:col-span-5">
              {(product.longevity || product.projection) && (
                <section className="mt-8 lg:mt-0">
                  <h2 className="latin mb-4 text-micro tracking-label text-ink3">PERFORMANCE</h2>
                  {product.longevity && <PerformanceMeter label={copy.longevity} band={product.longevity} locale={locale} />}
                  {product.projection && <PerformanceMeter label={copy.projection} band={product.projection} locale={locale} />}
                </section>
              )}

              {/* Brand independence (doc 01 §6): the seller stays visible
                  everywhere. Never flatten houses into anonymous SKUs. */}
              <section className="mt-8 border border-line bg-raised p-4 lg:p-5">
                <div className="latin mb-2 text-micro tracking-label text-accent">THE HOUSE</div>
                {/*
                  A LINK, at last.

                  The house's name has been on this page since the first
                  version, as text, going nowhere — on a marketplace whose whole
                  argument is that the maker is named. The block is what a
                  customer presses when they have decided they like a house and
                  want to see what else it makes, and until now that was a dead
                  end with a heading that said THE HOUSE.
                */}
                <Link
                  href={localeHref(locale, `/house/${product.houseSlug}`)}
                  className="tappable group inline-flex min-h-touch items-baseline gap-3"
                >
                  <span
                    {...langAttrs(locale, house.lang)}
                    className="font-display text-h4 transition-colors duration-base ease-out group-hover:text-accent lg:text-h3"
                  >
                    {house.text}
                  </span>
                  <span className="text-caption text-ink3 transition-colors duration-base ease-out group-hover:text-accent">
                    {copy.allItsPerfumes}
                  </span>
                </Link>
                <p className="mt-2 text-caption leading-relaxed text-ink3 lg:text-small">
                  {copy.shipsItself(num(arrival.min), num(arrival.max), nounIn(locale, arrival.max, NOUN.day))}
                </p>
              </section>
            </div>
          </div>

          {/*
            ------------------------------------------------------- reviews

            Above the suggestions from other houses, deliberately. A customer
            reading reviews is still deciding about THIS bottle; putting four
            other perfumes between them and that decision is an invitation to
            stop deciding.
          */}
          <ProductReviews productId={product.id} productName={name.text} />

          {/* -------------------------------------------------------- others */}
          {others.length > 0 && (
            <section className="mt-8 lg:mt-[96px]">
              <h2 className="mb-4 px-5 font-display text-h3 lg:mb-6 lg:px-0 lg:text-h2Lg">
                {copy.fromOtherHouses}
              </h2>

              {/*
                A rail that scrolls on a phone and a grid that does not on a
                desktop: horizontal scrolling with a mouse is a penalty, not a
                gesture.

                The tiles are capped in WIDTH rather than sharing the row, so a
                short list of suggestions stays a rail instead of becoming a
                second catalogue.
              */}
              <div className="flex gap-3 overflow-x-auto px-5 pb-2 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
                {/* A rail tile has a SIZE, not a share of the width. Letting two
                    of them divide 1240px produced a pair of 740px-tall bottles
                    that dwarfed the product being viewed — a suggestion louder
                    than the thing it is suggesting about. */}
                {others.map((p) => (
                  <div key={p.id} className="w-[148px] flex-none lg:w-full lg:max-w-[240px]">
                    <ProductTile product={p} locale={locale} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />

      <BuyBlock
        productId={product.id}
        pricePiastres={product.pricePiastres}
        inStock={product.inStock}
        variant="bar"
        locale={locale}
      />

      {/* Product structured data — this page is an acquisition surface. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: name.text,
            brand: { '@type': 'Brand', name: house.text },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'EGP',
              price: (product.pricePiastres / 100).toFixed(2),
              availability: product.inStock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            },
          }),
        }}
      />
    </>
  );
}
