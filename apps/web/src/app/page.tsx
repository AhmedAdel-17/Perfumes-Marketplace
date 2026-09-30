import Link from 'next/link';
import { listPublishedProducts } from '@/core/catalogue';
import { api } from '@/core/api';
import { ProductTile } from '@/features/catalogue/ProductTile';
import { Flacon } from '@/features/product/Flacon';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { Reveal } from '@/features/shell/Reveal';
import { Track } from '@/features/analytics/Track';
import { countedIn, CURRENCY_LABEL, editorialIn, formatPrice, HOME, NOUN } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await listPublishedProducts();
  const { heroProductId, featuredProductIds } = await api().site.curation();
  const locale = await getLocale();
  const copy = HOME[locale];
  const perfumes = countedIn(locale, products.length, NOUN.perfume, editorialIn(locale));

  /*
   * Which product opens the site is a DECISION, and until now it was
   * `products[0]` — whichever row the database returned first, which is nobody's
   * decision at all.
   *
   * The fall-back is that same behaviour, so a marketplace that has not curated
   * anything looks exactly as it did. A hero that has since been unpublished
   * falls back too rather than 404ing the front door: the curation row keeps a
   * foreign key with ON DELETE SET NULL for deletion, but unpublishing is not
   * deletion, so the check has to be here as well.
   */
  const curated = heroProductId
    ? products.find((p) => p.id === heroProductId)
    : undefined;
  const hero = curated ?? products[0];

  /*
   * Featured products lead the grid, in the order they were curated, and the
   * rest follow. Not a separate section: two grids of the same thing is a
   * layout that asks the visitor to work out the difference, and the answer —
   * "somebody at the marketplace liked these" — is not worth a heading.
   */
  const rank = new Map(featuredProductIds.map((id, index) => [id, index]));
  const rest = products
    .filter((p) => p.id !== hero?.id)
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));

  return (
    <>
      <SiteHeader />

      {/* The top of the funnel: somebody arrived. Renders nothing. */}
      <Track event="landing_view" />

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
          <section
            /*
              `text-ink` is restated here and it is NOT redundant.

              `color` INHERITS. The body resolves `text-ink` once, against the
              root theme, and hands the computed colour down — so a headline
              that simply inherits arrives graphite even inside a dark scope,
              because nothing re-read the variable. The scope changes what
              `--c-ink` means; only an element that actually asks for it gets
              the new answer. Every dark-scoped panel has to restate its ink.
            */
            className="relative overflow-hidden border-b border-line/70 text-ink"
            /*
              A lit room, in both themes. The attribute scopes every colour role
              inside this section to the dark palette — headline, label, rules,
              accent — so the opening reads the same on paper as it does on
              noir, and no element inside needs to know there are two themes.
              See the note on themeBaseStyles in theme.ts.
            */
            data-theme="dark"
          >
            <div className="absolute inset-0 bg-[radial-gradient(64%_78%_at_74%_32%,theme(colors.stage.glow)_0%,theme(colors.stage.mid)_44%,theme(colors.stage.deep)_80%)]" />
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
                <Link href={localeHref(locale, `/p/${hero.slug}`)} aria-label={hero.name} className="block">
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
                  <div className="latin mb-5 text-micro tracking-label text-accent lg:mb-7 lg:text-caption">
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
                    {copy.headline}
                    <br />
                    <span className="text-accent">{copy.headlineAccent}</span>
                  </h1>
                </Reveal>

                <Reveal delay={240}>
                  <p className="mt-5 max-w-proseMax text-small leading-relaxed text-ink2 lg:mt-7 lg:text-bodyLg">
                    {/* Arabic inflects a counted noun six ways — @diyar/i18n → plural.ts. */}
                    {copy.intro(perfumes)}
                  </p>
                </Reveal>

                <Reveal delay={320}>
                  <Link
                    href={localeHref(locale, `/p/${hero.slug}`)}
                    className="tappable mt-7 inline-flex items-baseline gap-3 border-b border-accent/50 pb-2 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent lg:mt-9"
                  >
                    <span className="font-display text-h4 lg:text-h3Lg">{hero.name}</span>
                    <span className="latin text-caption tracking-label text-accent">
                      {hero.brandLatin}
                    </span>
                    <span className="text-small text-ink2">
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
        <Reveal as="section" className="border-b border-line/70">
          <div className="mx-auto max-w-contentMax px-5 py-9 lg:px-8 lg:py-[104px]">
            <p className="max-w-[860px] font-display text-h3 leading-[1.5] text-ink lg:text-h1Lg lg:leading-[1.45]">
              {copy.promise}
              <span className="text-ink3">{copy.promiseSecond}</span>
            </p>
          </div>
        </Reveal>

        {/* ------------------------------------------------------------- grid */}
        <section className="mx-auto max-w-contentMax px-5 py-8 lg:px-8 lg:py-[88px]">
          <Reveal>
            <div className="mb-6 flex items-baseline justify-between border-b border-line pb-4 lg:mb-9">
              <h2 className="font-display text-h3 lg:text-h2Lg">{copy.allPerfumes}</h2>
              <span className="text-caption tracking-label text-ink3 lg:text-small">
                {perfumes}
              </span>
            </div>
          </Reveal>

          {products.length === 0 ? (
            /* Day one is a real state, not an edge case: the catalogue is empty
               until the first house clears verification. Saying so plainly beats
               a grid of skeletons that never fill in. */
            <p className="py-8 text-center text-small leading-relaxed text-ink3">
              {copy.empty}
            </p>
          ) : (
            /*
              Two columns on a phone, rising to four on a wide monitor — but
              never more columns than there are products.
              
              A four-column grid holding three items leaves a hole the width of
              a product and reads as a layout fault rather than a short
              catalogue. Capping at the count keeps the row full at every size,
              and the cap stops mattering the moment there are four listings.
              The tile is width-agnostic, so this is the only place the column
              count is decided.
            */
            <div className={[
              'grid gap-x-4 gap-y-8 lg:gap-x-7 lg:gap-y-[68px]',
              products.length === 1 ? 'grid-cols-1 max-w-[420px]' : 'grid-cols-2',
              products.length >= 3 ? 'sm:grid-cols-3' : '',
              products.length >= 4 ? 'xl:grid-cols-4' : '',
            ].join(' ')}>
              {products.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 3) * 90}>
                  <ProductTile product={p} locale={locale} />
                </Reveal>
              ))}
            </div>
          )}

          {rest.length === 0 && products.length > 0 && (
            <p className="mt-8 text-caption text-ink3">{copy.moreHouses}</p>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
