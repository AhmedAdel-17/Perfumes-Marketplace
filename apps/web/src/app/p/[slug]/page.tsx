import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProductBySlug, listPublishedProducts } from '@/core/catalogue';
import { NotesPyramid } from '@/features/product/NotesPyramid';
import { EvolutionCurve } from '@/features/product/EvolutionCurve';
import { PerformanceMeter } from '@/features/product/PerformanceMeter';
import { BottleFigure } from '@/features/product/BottleFigure';
import { BuyBlock } from '@/features/product/BuyBlock';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { DAY, data as num, plural } from '@diyar/i18n';

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
  if (!product) return { title: 'غير موجود' };

  return {
    title: `${product.name} — ${product.brandName} | ديار`,
    description: `${product.name} من ${product.brandName}. ${product.concentrationLabel}، ${product.volumeMl} مل.`,
    openGraph: {
      title: `${product.name} — ${product.brandName}`,
      type: 'website',
      locale: 'ar_EG',
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await findProductBySlug(slug);
  if (!product) notFound();

  const others = (await listPublishedProducts()).filter((p) => p.slug !== slug).slice(0, 4);
  const days = Math.ceil(product.fulfilmentHours / 24);

  return (
    <>
      <SiteHeader />

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
                <div className="relative h-[330px] overflow-hidden lg:h-[600px] lg:rounded-sm">
                  <div className="absolute inset-0 bg-[radial-gradient(112%_82%_at_50%_30%,#3F3226_0%,#241C16_46%,#0B0A09_80%)]" />

                  <div className="absolute end-1/2 top-11 translate-x-[-50%] lg:top-[104px]">
                    <BottleFigure gradient={product.bottle} className="lg:scale-[1.85]" />
                  </div>

                  {/* Fades the plate into the page so the title can sit over it
                      on a phone without a hard seam. */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,#0B0A09_16%,rgba(11,10,9,.86)_38%,transparent_68%)] lg:hidden" />
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------- details */}
            <div className="lg:col-span-5">
              {/* On a phone this block is pulled UP over the gradient above,
                  which gives the overlaid title of the original design with a
                  single h1 in the document rather than one per breakpoint. */}
              <div className="relative z-10 -mt-[84px] px-5 lg:mt-0 lg:px-0">
                <div className="latin mb-2 text-caption tracking-label text-brass">
                  {product.brandLatin}
                </div>
                <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{product.name}</h1>
                <p className="mt-2 text-small text-dim lg:mt-3 lg:text-bodyLg">
                  <span className="tnum">{num(product.volumeMl)}</span> مل · {product.concentrationLabel}
                </p>
              </div>

              <div className="px-5 lg:px-0">
                <div className="mt-7 lg:mt-8">
                  <BuyBlock
                    pricePiastres={product.pricePiastres}
                    inStock={product.inStock}
                    variant="inline"
                  />
                </div>

                {/* ------------------------------------------------- pyramid */}
                <div className="pt-6 lg:pt-8">
                  <NotesPyramid
                    top={product.notesTop}
                    heart={product.notesHeart}
                    base={product.notesBase}
                  />
                </div>

                {/* ----------------------------------------------- evolution */}
                <div className="-mx-5 lg:mx-0">
                  <EvolutionCurve
                    topCount={product.notesTop.length}
                    heartCount={product.notesHeart.length}
                    baseCount={product.notesBase.length}
                  />
                </div>

                {/* -------------------------------------------------- meters */}
                {(product.longevity || product.projection) && (
                  <section className="mt-8">
                    <h2 className="latin mb-4 text-micro tracking-label text-faint">PERFORMANCE</h2>
                    {product.longevity && <PerformanceMeter label="الثبات" band={product.longevity} />}
                    {product.projection && <PerformanceMeter label="الانتشار" band={product.projection} />}
                  </section>
                )}

                {/* --------------------------------------------------- house
                    Brand independence (doc 01 §6): the seller stays visible
                    everywhere. Never flatten houses into anonymous SKUs. */}
                <section className="mt-8 border border-hair bg-l1 p-4 lg:p-5">
                  <div className="latin mb-2 text-micro tracking-label text-brass">THE HOUSE</div>
                  <div className="font-display text-h4 lg:text-h3">{product.brandName}</div>
                  <p className="mt-2 text-caption leading-relaxed text-faint lg:text-small">
                    تُجهّز الدار وتشحن طلبها بنفسها. يصل خلال{' '}
                    <span className="tnum">{num(days)}</span> إلى{' '}
                    <span className="tnum">{num(days + 1)}</span> {plural(days + 1, DAY)}.
                  </p>
                </section>
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------- others */}
          {others.length > 0 && (
            <section className="mt-8 lg:mt-[96px]">
              <h2 className="mb-4 px-5 font-display text-h3 lg:mb-6 lg:px-0 lg:text-h2Lg">
                من دور أخرى
              </h2>

              {/* A rail that scrolls on a phone and a grid that does not on a
                  desktop: horizontal scrolling with a mouse is a penalty, not a
                  gesture. */}
              <div className="flex gap-3 overflow-x-auto px-5 pb-2 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
                {others.map((p) => (
                  <div key={p.id} className="w-[148px] flex-none lg:w-auto">
                    <ProductTile product={p} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />

      <BuyBlock
        pricePiastres={product.pricePiastres}
        inStock={product.inStock}
        variant="bar"
      />

      {/* Product structured data — this page is an acquisition surface. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            brand: { '@type': 'Brand', name: product.brandName },
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
