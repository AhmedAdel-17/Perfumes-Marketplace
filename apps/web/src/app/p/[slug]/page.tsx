import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findHouseBySlug, findProductBySlug, listPublishedProducts } from '@/core/catalogue';
import { api } from '@/core/api';
import { NotesPyramid } from '@/features/product/NotesPyramid';
import { EvolutionCurve } from '@/features/product/EvolutionCurve';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { BuyBlock } from '@/features/product/BuyBlock';
import { BandReading } from '@/features/catalogue/BandReading';
import { SpecimenCard } from '@/features/catalogue/SpecimenCard';
import { ProductReviews } from '@/features/reviews/ProductReviews';
import { SectionHead } from '@/features/shell/SectionHead';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { arrivalWindow } from '@diyar/api';
import {
  CONCENTRATION, data as num, editorialIn, HOUSES, labelOf, langAttrs, languageOf, NOUN, nounIn, pick, PRODUCT,
  SCENT_FAMILY, SHELL, type Locale,
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

  const [catalogue, houseDetail, locale] = await Promise.all([
    listPublishedProducts(),
    product.houseSlug ? findHouseBySlug(product.houseSlug) : Promise.resolve(null),
    getLocale(),
  ]);
  /*
   * "From other houses" means OTHER HOUSES. It used to drop only this perfume,
   * so a house with three listings showed two of its own under a heading that
   * said otherwise. The card carries the brand's Latin name and not the house,
   * and a house trades under one brand, so the brand is the test.
   */
  const others = catalogue.filter((p) => p.brandLatin !== product.brandLatin).slice(0, 4);
  const ratings = others.length > 0
    ? await api().reviews.summaries({ productIds: others.map((p) => p.id) })
    : {};

  // The SAME window the bag, the checkout and the confirmation quote. This page
  // used to compute its own and promised a day earlier than every screen after
  // it — see `arrivalWindow`.
  const arrival = arrivalWindow(product.fulfilmentHours);
  const copy = PRODUCT[locale];
  const name = pick(locale, product.name, product.nameEn);
  const house = pick(locale, product.brandName, product.brandNameEn);
  const days = nounIn(locale, arrival.max, NOUN.day);

  // Each fact its own span: the city is whatever the house typed, usually
  // Arabic, and on the English page it has to be marked as such.
  const houseFacts: Array<{ text: string; lang: Locale }> = [];
  if (houseDetail?.city) houseFacts.push({ text: houseDetail.city, lang: languageOf(houseDetail.city) });
  if (houseDetail?.foundedYear) {
    houseFacts.push({ text: HOUSES[locale].since(editorialIn(locale)(houseDetail.foundedYear, false)), lang: locale });
  }

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

      {/*
        Visual identity v2. The layout is design-reference/product.html's (the
        bottle, then the name, the price, the notes, the evolution, the
        performance); the finish is 04-laboratoire's, which wins where the two
        disagree (CLAUDE.md §12): the perfume printed as a specimen sheet, every
        figure ruled into a row, every band with its source.
      */}
      <main className="pb-[92px] lg:pb-0">
        <div className="mx-auto max-w-contentMax px-5 pt-5 lg:px-8 lg:pt-8">
          <div className="grid gap-7 lg:grid-cols-12 lg:gap-8">
            {/* ------------------------------------------------------ media
                In RTL the first grid child lands on the RIGHT, which is where
                the eye starts — so the bottle leads and the copy follows it,
                the same order a phone reads top to bottom. */}
            <div className="lg:col-span-7">
              <div className="border border-ink bg-raised lg:sticky lg:top-[100px]">
                <div className="latin flex justify-between border-b border-ink px-4 py-2 text-micro tracking-label text-ink2">
                  <span>{copy.specimen.toUpperCase()}</span>
                  <span>{product.brandLatin}</span>
                </div>
                <div className="relative aspect-[4/5] overflow-hidden bg-plate lg:aspect-auto lg:h-[620px]">
                  {product.photo ? (
                    // `priority`: the largest paint on the page.
                    <ProductPhoto photo={product.photo} priority sizes="(min-width: 1024px) 58vw, 100vw" />
                  ) : (
                    <Reveal className="absolute inset-0 flex items-center justify-center">
                      <Flacon
                        family={product.family}
                        house={product.brandLatin}
                        uid={`hero-${product.id}`}
                        className="h-[84%] w-auto"
                      />
                    </Reveal>
                  )}
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------- details */}
            <div className="lg:col-span-5">
              <div className="latin mb-2 text-caption tracking-label text-accent">{product.brandLatin}</div>
              <h1 {...langAttrs(locale, name.lang)} className="font-display text-h1 leading-heading lg:text-h1Lg">
                {name.text}
              </h1>
              <p className="mt-2 text-body text-ink2 lg:mt-3 lg:text-bodyLg">
                <Link
                  href={localeHref(locale, `/house/${product.houseSlug}`)}
                  className="tappable inline-flex min-h-touch items-center text-ink transition-colors duration-base ease-out hover:text-accent"
                >
                  <span {...langAttrs(locale, house.lang)} className="border-b border-current">{house.text}</span>
                </Link>
                {houseFacts.map((fact) => (
                  <span key={fact.text}>
                    {' · '}
                    <span {...langAttrs(locale, fact.lang)}>{fact.text}</span>
                  </span>
                ))}
              </p>

              <div className="mt-6 lg:mt-7">
                <BuyBlock
                  productId={product.id}
                  pricePiastres={product.pricePiastres}
                  inStock={product.inStock}
                  variant="inline"
                  locale={locale}
                />
              </div>

              {/* The label: the same rows, in the same order, as every specimen. */}
              <dl className="mt-6 border-t border-ink text-body lg:mt-0 lg:border-t-0 lg:text-bodyLg">
                <Row label={copy.family}>{labelOf(SCENT_FAMILY, locale, product.family)}</Row>
                {product.concentration && (
                  <Row label={copy.concentration}>{labelOf(CONCENTRATION, locale, product.concentration)}</Row>
                )}
                <Row label={copy.size}><span className="tnum">{num(product.volumeMl)}</span> {copy.ml}</Row>
                {product.longevity && (
                  <Row label={copy.longevity}>
                    <BandReading kind="longevity" reading={product.longevity} locale={locale} />
                  </Row>
                )}
                {product.projection && (
                  <Row label={copy.projection}>
                    <BandReading kind="projection" reading={product.projection} locale={locale} />
                  </Row>
                )}
                <Row label={copy.delivery}>{copy.arrives(num(arrival.min), num(arrival.max), days)}</Row>
              </dl>

              {/* Brand independence (doc 01 §6): the seller stays visible
                  everywhere. Never flatten houses into anonymous SKUs. */}
              <section aria-labelledby="the-house" className="mt-7 border border-line bg-raised p-5">
                <div className="latin mb-2 text-micro tracking-label text-accent">{copy.theHouse.toUpperCase()}</div>
                <h2 id="the-house" className="sr-only">{house.text}</h2>
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
                  <span className="text-small text-ink2 transition-colors duration-base ease-out group-hover:text-accent">
                    {copy.allItsPerfumes}
                  </span>
                </Link>
                <p className="mt-2 text-small leading-relaxed text-ink2 lg:text-body">
                  {copy.shipsItself(num(arrival.min), num(arrival.max), days)}
                </p>
              </section>
            </div>
          </div>

          {/* ------------------------------------------------------ 01 notes */}
          <section aria-labelledby="notes" className="mt-9 lg:mt-[104px]">
            <SectionHead id="notes" index={copy.notesIndex} title={copy.notesTitle} />
            <p className="-mt-3 mb-7 max-w-proseMax text-body leading-relaxed text-ink2 lg:mb-8 lg:text-bodyLg">{copy.notesLede}</p>
            <NotesPyramid
              top={product.notesTop}
              heart={product.notesHeart}
              base={product.notesBase}
              english={product.noteEnglish}
              locale={locale}
            />
            <div className="mt-8 lg:w-7/12">
              <EvolutionCurve
                topCount={product.notesTop.length}
                heartCount={product.notesHeart.length}
                baseCount={product.notesBase.length}
                locale={locale}
              />
            </div>
          </section>

          {/*
            --------------------------------------------------- 02 reviews

            Above the suggestions from other houses, deliberately. A customer
            reading reviews is still deciding about THIS bottle; putting four
            other perfumes between them and that decision is an invitation to
            stop deciding.
          */}
          <div className="mt-9 lg:mt-[104px]">
            <ProductReviews productId={product.id} productName={name.text} index={copy.reviewsIndex} />
          </div>

          {/* -------------------------------------------------- 03 others */}
          {others.length > 0 && (
            <section aria-labelledby="others" className="mt-9 pb-9 lg:mt-[104px] lg:pb-[104px]">
              <SectionHead id="others" index={copy.othersIndex} title={copy.fromOtherHouses} />
              {/*
                A rail that scrolls on a phone and a grid that does not on a
                desktop: horizontal scrolling with a mouse is a penalty, not a
                gesture. A rail card has a SIZE, not a share of the width, so a
                short list stays a rail rather than two giant cards that dwarf
                the perfume being viewed.
              */}
              <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
                {others.map((p) => (
                  <li key={p.id} className="w-[200px] flex-none lg:w-auto">
                    <SpecimenCard product={p} locale={locale} rating={ratings[p.id]} sizes="(min-width: 1024px) 25vw, 200px" />
                  </li>
                ))}
              </ul>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 border-b border-line py-3 lg:grid-cols-[132px_1fr]">
      <dt className="text-ink3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
