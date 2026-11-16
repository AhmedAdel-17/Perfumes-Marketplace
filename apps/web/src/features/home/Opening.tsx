import Link from 'next/link';
import type { HouseDetail, ProductDetail } from '@/core/catalogue';
import { AddToBag } from '@/features/cart/AddToBag';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { writeKit } from '@/features/product/reveal/kit';
import { Sillage } from '@/features/motion/Sillage';
import { Arch } from '@/features/shell/Arch';
import { primarySurface } from '@/features/shell/primary-surface';
import {
  CONCENTRATION, countedIn, CURRENCY_LABEL, data as num, editorialIn, formatPrice, HOME, HOUSES, labelOf,
  langAttrs, languageOf, NOUN, pick, PRODUCT, type Locale,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';

/**
 * The opening (identity v3, 16 Nov 2026): the claim on one side, and on the
 * other a perfume seen through the doorway of its house.
 *
 * WHAT CHANGED, AND WHY. The opening used to answer its headline with a
 * specimen sheet — nine ruled rows beside a 72px sentence. It proved the claim
 * and looked like a form. A perfume is bought on desire first and on facts
 * second, so the photograph now leads, at the full height of the fold, inside
 * the mark's own arch (`Arch`), with daylight crossing the wall behind it; the
 * facts follow as a LABEL under it, the way a gallery labels a piece: the
 * name, the house, what you smell first, the price, and the bag.
 *
 * Everything on the label is still a row from the catalogue. The source line
 * under longevity — the proof the headline promises — moved one press away, to
 * the perfume's own page, where it stands beside the reading it qualifies.
 *
 * The three figures under the lede are counts of what is published today, not
 * decoration: a shop with three houses says three.
 */
export function Opening({
  product, house, locale, arrival, houseCount, perfumeCount, secondary,
}: {
  /** The perfume the site opens on. Null on day one, before any house is live. */
  product: ProductDetail | null;
  house: HouseDetail | null;
  locale: Locale;
  arrival: { min: number; max: number } | null;
  houseCount: number;
  perfumeCount: number;
  /** The second way in: by scent when there are notes to show, else the houses. */
  secondary: { href: string; label: string };
}) {
  const copy = HOME[locale];
  const say = editorialIn(locale);

  return (
    <div className="relative overflow-clip">
      {/* The room's light. Decorative, behind everything, never over text it would wash out. */}
      <div aria-hidden="true" className="daylight" />

      <div className="relative mx-auto grid max-w-contentMax items-center gap-9 px-5 pb-9 pt-8 lg:min-h-[calc(100svh-84px)] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-[72px] lg:px-8 lg:py-[56px]">
        <div className="min-w-0">
          <span className="fade-in latin flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
            {copy.kicker.toUpperCase()}
            <span aria-hidden="true" className="draw-in h-px w-12 bg-current [--rise-delay:120ms]" />
          </span>
          {/*
            Arabic display type wants room between lines that Latin does not:
            1.2 for Arabic, 1.02 for the English serif (CLAUDE.md §15 — set the
            scale for Arabic first). The accent line is italic on the English
            site: Newsreader has an italic worth showing, and Naskh has none.
          */}
          <h1 className="mt-5 font-display text-h1Lg leading-[1.2] lg:mt-7 lg:text-displayLg [html[lang=en]_&]:leading-[1.02] xl:text-displayXl">
            <span className="rise [--rise-delay:80ms]">{copy.headline}</span>
            <em className="rise not-italic text-accent [--rise-delay:200ms] [html[lang=en]_&]:italic">{copy.headlineAccent}</em>
          </h1>
          <p className="rise mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2 [--rise-delay:340ms] lg:mt-7 lg:text-h4">{copy.lede}</p>
          <div className="fade-in mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 [--rise-delay:480ms] lg:mt-9">
            <Link href={localeHref(locale, '/search')} className={`${primarySurface} px-7`}>
              {copy.browse}
              <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="rtl:-scale-x-100">
                <path d="M0 5h17M13 1l4 4-4 4" />
              </svg>
            </Link>
            <a
              href={secondary.href}
              className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
            >
              <span className="link-line">{secondary.label}</span>
            </a>
          </div>

          {/* What is on the shelves today, counted. */}
          <dl className="fade-in mt-9 grid max-w-proseMax grid-cols-3 border-t border-line [--rise-delay:620ms] lg:mt-[72px]">
            <Figure label={copy.figureHouses} value={countedIn(locale, houseCount, NOUN.house, say)} />
            <Figure label={copy.figurePerfumes} value={countedIn(locale, perfumeCount, NOUN.perfume, say)} />
            <Figure label={copy.figurePayment} value={copy.payOnDelivery} />
          </dl>
        </div>

        {product && (
          <Portrait product={product} house={house} locale={locale} arrival={arrival} />
        )}
      </div>

      {/* A drop on a thread: there is more below. Desktop only — a phone is already scrolling. */}
      <span aria-hidden="true" className="scroll-thread hidden lg:block" />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-s border-line py-4 ps-4 first:border-s-0 first:ps-0">
      <dt className="latin text-micro uppercase tracking-label text-ink3">{label}</dt>
      <dd className="mt-1.5 font-display text-h4 leading-heading lg:text-h4Lg">{value}</dd>
    </div>
  );
}

/** The perfume through the doorway, and its label. */
function Portrait({
  product, house, locale, arrival,
}: {
  product: ProductDetail;
  house: HouseDetail | null;
  locale: Locale;
  arrival: { min: number; max: number } | null;
}) {
  const copy = HOME[locale];
  const words = PRODUCT[locale];
  const name = pick(locale, product.name, product.nameEn);
  const houseName = pick(locale, product.brandName, product.brandNameEn);
  const href = localeHref(locale, `/p/${product.slug}`);
  // Le Dévoilement as the way in: the photograph and the name both lead to the perfume through the reveal.
  const kit = writeKit(product, href, name);

  const facts: Array<{ text: string; lang: Locale }> = [];
  if (house?.city) facts.push({ text: house.city, lang: languageOf(house.city) });
  if (house?.foundedYear) facts.push({ text: HOUSES[locale].since(editorialIn(locale)(house.foundedYear, false)), lang: locale });

  const opening = product.notesTop.slice(0, 3);

  return (
    <article
      aria-labelledby="specimen-name"
      data-reveal-card={kit}
      className="fade-in relative mx-auto w-full max-w-[380px] [--rise-delay:260ms]"
    >
      <Link href={href} tabIndex={-1} aria-hidden="true" className="group block">
        <Arch ratio={4 / 3} frameClassName="bg-plate">
          <div data-reveal-frame={kit ? '' : undefined} className="absolute inset-0">
            {product.photo ? (
              <ProductPhoto
                photo={product.photo}
                sizes="(min-width: 1024px) 380px, 100vw"
                priority
                className="transition-transform duration-ceremony ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            ) : (
              <Flacon
                family={product.family}
                house={product.brandLatin}
                uid="opening"
                className="absolute inset-0 h-full w-full px-[30%] pb-[8%] pt-[30%]"
              />
            )}
            {/* Le Sillage: the perfume's trail behind the pointer, inside the doorway only. */}
            <Sillage family={product.family} />
          </div>
        </Arch>
      </Link>

      {/*
        THE THRESHOLD. In the mark a line lies under the doorway without
        touching its jambs; here that line is the perfume's label — as wide as
        the door, a step below it, never over the photograph (the first v3
        draft pinned it across the bottle it was describing).
      */}
      <div className="mt-3 border border-ink bg-raised">
        <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-3.5">
          <div className="min-w-0">
            <span className="latin block text-micro tracking-label text-ink3">{product.brandLatin}</span>
            <Link href={href} className="tappable mt-0.5 inline-block transition-colors duration-base ease-out hover:text-accent">
              <h2 id="specimen-name" {...langAttrs(locale, name.lang)} className="font-display text-h3 leading-heading lg:text-h3Lg">
                {name.text}
              </h2>
            </Link>
            <p className="text-small text-ink2">
              <span {...langAttrs(locale, houseName.lang)}>{houseName.text}</span>
              {facts.map((fact) => (
                <span key={fact.text}>
                  {' · '}
                  <span {...langAttrs(locale, fact.lang)}>{fact.text}</span>
                </span>
              ))}
            </p>
          </div>
          <span className="shrink-0 pt-4 text-h4">
            <span className="tnum">{formatPrice(product.pricePiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
          </span>
        </div>
        <dl className="border-t border-line text-small">
          {opening.length > 0 && (
            <LabelRow label={words.topNotes}>
              {opening.map((note, i) => {
                const english = locale === 'en' ? product.noteEnglish[note] : undefined;
                return (
                  <span key={note}>
                    {i > 0 && copy.listSeparator}
                    {english ?? <span {...langAttrs(locale, 'ar')}>{note}</span>}
                  </span>
                );
              })}
              <span className="text-ink3">
                {' · '}
                {labelOf(CONCENTRATION, locale, product.concentration)}
                {' · '}
                <span className="tnum">{num(product.volumeMl)}</span> {words.ml}
              </span>
            </LabelRow>
          )}
          {arrival && <LabelRow label={copy.delivery}>{copy.arrives(num(arrival.min), num(arrival.max))}</LabelRow>}
        </dl>
        <AddToBag
          productId={product.id}
          pricePiastres={product.pricePiastres}
          inStock={product.inStock}
          family={product.family}
          className={`${primarySurface} w-full`}
        />
      </div>
    </article>
  );
}

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-baseline gap-3 border-b border-line px-4 py-2 last:border-b-0">
      <dt className="text-ink3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
