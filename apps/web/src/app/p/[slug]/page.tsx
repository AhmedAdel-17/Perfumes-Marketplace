import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findProductBySlug, listPublishedProducts } from '@/core/catalogue';
import { NotesPyramid } from '@/features/product/NotesPyramid';
import { EvolutionCurve } from '@/features/product/EvolutionCurve';
import { PerformanceMeter } from '@/features/product/PerformanceMeter';
import { CURRENCY_LABEL, formatPrice, data as num } from '@diyar/i18n';

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

  const others = (await listPublishedProducts()).filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <main className="mx-auto max-w-[420px] pb-[92px]">
      {/* ---------------------------------------------------------- hero */}
      <div className="relative h-[330px] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(112%_82%_at_50%_30%,#3F3226_0%,#241C16_46%,#0B0A09_80%)]" />

        <div className="absolute end-1/2 top-11 w-[96px] translate-x-[-50%]">
          <div className="mx-auto h-[26px] w-[32px] rounded-sm bg-[linear-gradient(100deg,#2A241D,#4A3F31_46%,#241F19)]" />
          <div className="mx-auto h-[12px] w-[25px] bg-[linear-gradient(100deg,#6B5334,#9A7A4A_44%,#5E4830)]" />
          <div
            className="relative h-[136px] overflow-hidden rounded-[3px_3px_5px_5px]"
            style={{ background: product.bottle }}
          >
            <div className="absolute end-[13%] top-[8%] h-[64%] w-[13%] rounded-lg bg-gradient-to-b from-white/40 to-white/[.05]" />
            <div className="latin absolute bottom-[18px] end-1/2 flex h-[28px] w-[60%] translate-x-[-50%] items-center justify-center border-y border-bone/20 bg-[rgba(15,12,9,.44)] text-[8px] tracking-label text-bone/[.85]">
              DIYAR
            </div>
          </div>
        </div>

        <div className="absolute inset-0 bg-[linear-gradient(to_top,#0B0A09_16%,rgba(11,10,9,.86)_38%,transparent_68%)]" />

        <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
          <div className="latin mb-2 text-caption tracking-label text-brass">{product.brandLatin}</div>
          <h1 className="font-display text-h1 leading-heading">{product.name}</h1>
          <p className="mt-2 text-small text-dim">
            <span className="tnum">{num(product.volumeMl)}</span> مل · {product.concentrationLabel}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------- pyramid */}
      <div className="pt-6">
        <NotesPyramid
          top={product.notesTop}
          heart={product.notesHeart}
          base={product.notesBase}
        />
      </div>

      {/* ------------------------------------------------------ evolution */}
      <EvolutionCurve
        topCount={product.notesTop.length}
        heartCount={product.notesHeart.length}
        baseCount={product.notesBase.length}
      />

      {/* -------------------------------------------------------- meters */}
      {(product.longevity || product.projection) && (
        <section className="mt-8 px-5">
          <h2 className="latin mb-4 text-micro tracking-label text-faint">PERFORMANCE</h2>
          {product.longevity && <PerformanceMeter label="الثبات" band={product.longevity} />}
          {product.projection && <PerformanceMeter label="الانتشار" band={product.projection} />}
        </section>
      )}

      {/* --------------------------------------------------------- house
          Brand independence (doc 01 §6): the seller stays visible everywhere.
          Never flatten houses into anonymous SKUs. */}
      <section className="mx-5 mt-8 border border-hair bg-l1 p-4">
        <div className="latin mb-2 text-micro tracking-label text-brass">THE HOUSE</div>
        <div className="font-display text-h4">{product.brandName}</div>
        <p className="mt-2 text-caption leading-relaxed text-faint">
          تُجهّز الدار وتشحن طلبها بنفسها. يصل خلال{' '}
          <span className="tnum">{num(Math.ceil(product.fulfilmentHours / 24))}</span> إلى{' '}
          <span className="tnum">{num(Math.ceil(product.fulfilmentHours / 24) + 1)}</span> أيام.
        </p>
      </section>

      {/* --------------------------------------------------------- others */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 px-5 font-display text-h3">من دور أخرى</h2>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2">
            {others.map((p) => (
              <a key={p.id} href={`/p/${p.slug}`} className="w-[148px] flex-none">
                <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_30%,#3A2F26,#1A1512_62%,#0D0B0A)]">
                  <div
                    className="absolute end-1/2 top-1/2 h-[86px] w-[44px] translate-x-[-50%] translate-y-[-50%] rounded-sm"
                    style={{ background: p.bottle }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-noir/[.72] to-transparent" />
                </div>
                <div className="latin mb-1 mt-3 text-[8px] tracking-label text-brass">{p.brandLatin}</div>
                <div className="font-display text-h4 leading-tight">{p.name}</div>
                <div className="mt-2 text-small font-semibold">
                  <span className="tnum">{formatPrice(p.pricePiastres)}</span>
                  <span className="latin ms-2 text-[8px] tracking-label text-dim">{CURRENCY_LABEL}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ buy bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-hair bg-noir">
        <div className="mx-auto flex max-w-[420px] items-center gap-3 px-5 py-3">
          <div className="flex-none">
            <div className="text-h4 font-semibold">
              <span className="tnum">{formatPrice(product.pricePiastres)}</span>
              <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
            </div>
            <div className="text-micro text-faint">
              {product.inStock ? 'متاح الآن' : 'غير متاح حاليًا'}
            </div>
          </div>
          <button
            type="button"
            disabled={!product.inStock}
            className="flex h-control flex-1 items-center justify-center rounded-sm bg-brass text-bodyLg font-semibold text-noir transition-opacity duration-instant ease-out active:opacity-press disabled:opacity-disabled"
          >
            أضف إلى الحقيبة
          </button>
        </div>
      </div>

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
    </main>
  );
}
