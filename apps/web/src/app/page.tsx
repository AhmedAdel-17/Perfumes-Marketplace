import Link from 'next/link';
import { listPublishedProducts } from '@/core/catalogue';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { Flacon } from '@/features/product/Flacon';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { counted, CURRENCY_LABEL, editorial, formatPrice, PERFUME } from '@diyar/i18n';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await listPublishedProducts();
  const [hero, ...rest] = products;

  return (
    <>
      <SiteHeader />

      <main>
        {/*
          ------------------------------------------------------------- opening

          A maison opens with ONE object, lit, at scale — not with a grid of
          nine. The grid is where you go once you have decided to look; the
          opening is what decides you. It is the difference between a shop
          window and a shelf, and it is the single largest reason a marketplace
          reads as a marketplace rather than as a house.

          The composition is deliberately asymmetric: the flacon holds the start
          edge (right, in RTL) at nearly full bleed, the type holds the end edge,
          and the light source sits between them. Centring both would be safe and
          would look like a template.
        */}
        {hero && (
          <section className="relative overflow-hidden border-b border-hair/70">
            <div className="absolute inset-0 bg-[radial-gradient(64%_78%_at_74%_32%,#2C221A_0%,#15100D_44%,#070606_80%)]" />
            {/* The source. Kept separate from the ground so its warmth can be
                stronger than the ambient without lifting the black point. */}
            <div className="absolute inset-0 bg-[radial-gradient(34%_40%_at_74%_14%,rgba(206,168,100,.18),transparent_74%)]" />

            <div className="relative mx-auto flex max-w-contentMax flex-col items-center gap-6 px-5 pb-9 pt-7 lg:min-h-[74vh] lg:flex-row lg:gap-10 lg:px-8 lg:pb-[104px] lg:pt-[88px]">
              {/*
                Sized by HEIGHT, never by width. The flacon is 240×440, so a
                width-driven rule on a wide screen produced a 1200px-tall bottle
                that pushed the entire composition off the page. Anything with a
                tall aspect ratio inside a viewport-height band has to be capped
                on the axis that is actually constrained.
              */}
              <Reveal className="flex w-full items-center justify-center lg:w-[46%]">
                <Link href={`/p/${hero.slug}`} aria-label={hero.name} className="block">
                  <Flacon
                    family={hero.family}
                    house={hero.brandLatin}
                    uid="hero"
                    className="h-[38vh] max-h-[300px] w-auto drop-shadow-[0_40px_80px_rgba(0,0,0,.6)] lg:h-[58vh] lg:max-h-[560px]"
                  />
                </Link>
              </Reveal>

              <div className="w-full lg:w-[54%]">
                <Reveal delay={80}>
                  <div className="latin mb-5 text-micro tracking-label text-brass lg:mb-7 lg:text-caption">
                    CAIRO · ALEXANDRIA · GIZA
                  </div>
                </Reveal>

                <Reveal delay={160}>
                  {/*
                    Amiri at 72px, and 108px on a wide screen. The previous 33px
                    headline was a phone size shown on a monitor, which is the
                    quietest way an interface can announce that it is an app.
                    Arabic display type earns this scale — the letterforms have
                    the contrast to carry it.
                  */}
                  <h1 className="font-display text-h1 leading-[1.08] tracking-tight lg:text-displayLg xl:text-displayXl">
                    دور العطور
                    <br />
                    <span className="text-brass">المصرية</span>
                  </h1>
                </Reveal>

                <Reveal delay={240}>
                  <p className="mt-5 max-w-proseMax text-small leading-relaxed text-dim lg:mt-7 lg:text-bodyLg">
                    {/* Arabic inflects a counted noun six ways — @diyar/i18n → plural.ts. */}
                    {counted(products.length, PERFUME, editorial)} من دور مختارة، بمعلومات
                    موحّدة وتقييمات موثّقة بالشراء.
                  </p>
                </Reveal>

                <Reveal delay={320}>
                  <Link
                    href={`/p/${hero.slug}`}
                    className="tappable mt-7 inline-flex items-baseline gap-3 border-b border-brass/50 pb-2 text-bodyLg text-bone transition-colors duration-base ease-out hover:border-brass hover:text-brass lg:mt-9"
                  >
                    <span className="font-display text-h4 lg:text-h3Lg">{hero.name}</span>
                    <span className="latin text-caption tracking-label text-brass">
                      {hero.brandLatin}
                    </span>
                    <span className="text-small text-dim">
                      <span className="tnum">{formatPrice(hero.pricePiastres)}</span>
                      <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
                    </span>
                  </Link>
                </Reveal>
              </div>
            </div>
          </section>
        )}

        {/*
          --------------------------------------------------------- the promise

          One line, set large, alone on the page. Restraint is only legible when
          something is given room — a paragraph in a box would say the same words
          and mean nothing.
        */}
        <Reveal as="section" className="border-b border-hair/70">
          <div className="mx-auto max-w-contentMax px-5 py-9 lg:px-8 lg:py-[104px]">
            <p className="max-w-[860px] font-display text-h3 leading-[1.5] text-bone/90 lg:text-h1Lg lg:leading-[1.45]">
              كل دار تصنع عطرها وتشحنه بنفسها.
              <span className="text-faint"> نحن نضمن أن ما تقرأه عنه صحيح.</span>
            </p>
          </div>
        </Reveal>

        {/* ------------------------------------------------------------- grid */}
        <section className="mx-auto max-w-contentMax px-5 py-8 lg:px-8 lg:py-[88px]">
          <Reveal>
            <div className="mb-6 flex items-baseline justify-between border-b border-hair pb-4 lg:mb-9">
              <h2 className="font-display text-h3 lg:text-h2Lg">كل العطور</h2>
              <span className="text-caption tracking-label text-faint lg:text-small">
                {counted(products.length, PERFUME, editorial)}
              </span>
            </div>
          </Reveal>

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
               is decided. The stagger caps at four so a long catalogue does not
               animate for three seconds. */
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:gap-x-7 lg:gap-y-[68px] xl:grid-cols-4">
              {products.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 3) * 90}>
                  <ProductTile product={p} />
                </Reveal>
              ))}
            </div>
          )}

          {rest.length === 0 && products.length > 0 && (
            <p className="mt-8 text-caption text-faint">دور جديدة تنضم كل أسبوع.</p>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
