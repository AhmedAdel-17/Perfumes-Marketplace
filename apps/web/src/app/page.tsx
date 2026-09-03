import { listPublishedProducts } from '@/core/catalogue';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { counted, editorial, PERFUME } from '@diyar/i18n';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await listPublishedProducts();

  return (
    <>
      <SiteHeader />

      <main>
        {/*
          The opening band is full-bleed on every width. Constraining the hero to
          the content column is what makes a site read as "a phone layout that
          was stretched"; a maison opens with the full page and constrains only
          the text inside it.
        */}
        <section className="relative overflow-hidden border-b border-hair">
          <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_78%_18%,#3F3226_0%,#1A1512_48%,#0B0A09_82%)]" />
          <div className="relative mx-auto max-w-contentMax px-5 py-8 lg:px-8 lg:py-[96px]">
            <div className="max-w-proseMax">
              <div className="latin mb-4 text-micro tracking-label text-brass lg:text-caption">
                CAIRO · ALEXANDRIA · GIZA
              </div>
              <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">
                دور العطور المصرية
              </h1>
              <p className="mt-4 text-small leading-relaxed text-dim lg:mt-5 lg:text-bodyLg">
                {/* Arabic inflects a counted noun six ways, so the phrase is
                    built rather than concatenated. @diyar/i18n → plural.ts. */}
                {counted(products.length, PERFUME, editorial)} من دور مختارة، بمعلومات
                موحّدة وتقييمات موثّقة بالشراء.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-contentMax px-5 py-7 lg:px-8 lg:py-8">
          <div className="mb-5 flex items-baseline justify-between border-b border-hair pb-3 lg:mb-7">
            <h2 className="font-display text-h3 lg:text-h2Lg">كل العطور</h2>
            <span className="text-caption tracking-label text-faint lg:text-small">
              {counted(products.length, PERFUME, editorial)}
            </span>
          </div>

          {products.length === 0 ? (
            /* Day one is a real state, not an edge case: the catalogue is empty
               until the first house clears verification. Saying so plainly beats
               a grid of skeletons that never fill in. */
            <p className="py-8 text-center text-small leading-relaxed text-faint">
              لم تُنشر أي عطور بعد. الدور الأولى قيد التوثيق.
            </p>
          ) : (
            /* Two columns on a phone, rising to four on a wide monitor. The tile
               is width-agnostic, so this line is the ONLY place the column count
               is decided. */
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:gap-x-6 lg:gap-y-8 xl:grid-cols-4">
              {products.map((p) => (
                <ProductTile key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
