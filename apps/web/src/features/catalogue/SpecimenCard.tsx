import Link from 'next/link';
import type { ProductCard } from '@/core/catalogue';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { writeKit } from '@/features/product/reveal/kit';
import { NoteIconMark } from './NoteChip';
import { glassPalette, scentFamily } from '@diyar/tokens';
import {
  CONCENTRATION, CURRENCY_LABEL, data as num, formatPrice, HOME, labelOf, langAttrs, pick,
  PRODUCT, SCENT_FAMILY, type Locale,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';

/** What the card shows of a perfume's reviews. Absent where a page did not ask. */
export interface CardRating {
  readonly count: number;
  readonly overall: number | null;
}

/**
 * One perfume on the shelf (identity v3, 16 Nov 2026 — replacing the ruled
 * specimen card of identity v2).
 *
 * THE PHOTOGRAPH IS THE CARD. The v2 card printed three ruled rows under a
 * square photograph, so a grid of perfumes read as a grid of forms; the
 * founder's verdict was that it did not make anyone want a perfume. The
 * photograph is now a tall 4:5 plate with nothing around it, and under it the
 * card says only what a shelf-edge says: the house, the name, one line of what
 * kind of perfume it is, and the price. Longevity is NOT here: a band is never
 * printed without its source (`BandReading`), and a card has no room to say
 * both well — so both are on the perfume's own page, side by side.
 *
 * Under the pointer: the photograph eases in by 4% over `ceremony`, a
 * passe-partout line draws inside the frame, and the blotter comes up with the
 * top notes (`Blotter`). Nothing lifts and nothing gains a shadow — depth is
 * value, never shadow (DESIGN_DOCTRINE).
 */
export function SpecimenCard({
  product, locale, rating, sizes = '(min-width: 1024px) 25vw, 50vw',
}: {
  product: ProductCard;
  locale: Locale;
  rating?: CardRating | undefined;
  sizes?: string;
}) {
  const name = pick(locale, product.name, product.nameEn);
  const copy = HOME[locale];
  const kind = [
    labelOf(SCENT_FAMILY, locale, product.family),
    labelOf(CONCENTRATION, locale, product.concentration),
    `${num(product.volumeMl)} ${PRODUCT[locale].ml}`,
  ].filter(Boolean).join(' · ');
  const href = localeHref(locale, `/p/${product.slug}`);
  // Le Dévoilement as the way in: the first press in a visit lifts this photograph into the reveal (RevealDirector).
  const kit = writeKit(product, href, name);

  return (
    <Link href={href} data-reveal-card={kit} className="perfume-card group flex h-full flex-col">
      <div data-reveal-frame={kit ? '' : undefined} className="card-plate relative aspect-[4/5] overflow-hidden bg-plate">
        {product.photo ? (
          <ProductPhoto
            photo={product.photo}
            sizes={sizes}
            className="transition-transform duration-ceremony ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <Flacon
            family={product.family}
            house={product.brandLatin}
            uid={`card-${product.id}`}
            className="absolute inset-0 h-full w-full px-[24%] py-[12%]"
          />
        )}
        {product.topNotes.length > 0 && <Blotter product={product} locale={locale} />}
        {!product.inStock && (
          <span className="absolute bottom-3 start-3 z-[2] border border-line bg-raised px-2.5 py-1 text-small text-ink2">
            {PRODUCT[locale].outOfStock}
          </span>
        )}
      </div>
      {product.topNotes.length > 0 && (
        <span className="sr-only">{copy.firstImpressionSaid(firstNotes(product, locale).map((n) => n.text).join(copy.listSeparator))}</span>
      )}

      <div className="flex flex-1 flex-col pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="latin text-micro tracking-label text-ink3 lg:text-caption">{product.brandLatin}</span>
          {rating && rating.count > 0 && rating.overall !== null && (
            <span className="shrink-0 text-small text-ink2">
              <span className="tnum">{rating.overall.toFixed(1)}</span>{' '}
              <span className="tnum">{copy.reviewsCount(num(rating.count))}</span>
            </span>
          )}
        </div>
        <span {...langAttrs(locale, name.lang)} className="mt-1 block font-display text-h4 leading-heading transition-colors duration-base ease-out group-hover:text-accent lg:text-h3">
          {name.text}
        </span>
        <span className="mt-1 block text-small text-ink2">{kind}</span>
        <span className="card-price mt-auto block pt-3 text-bodyLg">
          <span className="tnum">{formatPrice(product.pricePiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </span>
      </div>
    </Link>
  );
}

/** The top notes as this visitor reads them: English where the glossary has it. */
function firstNotes(product: ProductCard, locale: Locale) {
  return product.topNotes.map((n) => ({
    key: n.note,
    icon: n.icon,
    ...(locale === 'en' && n.en ? { text: n.en, lang: 'en' as const } : { text: n.note, lang: 'ar' as const }),
  }));
}

/**
 * LA MOUILLETTE — the blotter (Les Détails, founder 19 Oct 2026;
 * design-reference/experiences/04-details.html, No. 05). As at a perfumer's
 * counter: under the pointer, or on keyboard focus, a paper strip is drawn up
 * beside the bottle, its tip wet with the perfume's colour, and a small card
 * says what would reach you first — the top notes, with their drawings.
 *
 * All CSS, no script: it is a hover and a focus state of the card, so a phone,
 * where a tap opens the perfume, never sees it, and it costs nothing to load.
 * Decorative to assistive technology — the card says the same notes in words
 * (`firstImpressionSaid`).
 *
 * The real card shows the house's whole photograph, where the prototype stood a
 * cut-out on a floor, so the strip rises at the reading start of the frame and
 * the card sits across from it, leaving the bottle in the middle uncovered.
 */
function Blotter({ product, locale }: { product: ProductCard; locale: Locale }) {
  const glass = glassPalette(product.family);
  const own = (scentFamily as Record<string, string>)[product.family] ?? glass.core;
  return (
    <span
      aria-hidden="true"
      className="blotter"
      style={{ ['--blotter-ink-paper' as string]: own, ['--blotter-ink-night' as string]: glass.core }}
    >
      <span className="blotter-strip">
        <span className="blotter-brand latin">DIYAR</span>
        <span className="blotter-ink" />
      </span>
      <span className="blotter-card">
        <span className="latin blotter-kicker">{HOME[locale].firstImpression}</span>
        {firstNotes(product, locale).map((n) => (
          <span key={n.key} {...langAttrs(locale, n.lang)} className="blotter-note">
            <NoteIconMark icon={n.icon} className="blotter-icon" />
            {n.text}
          </span>
        ))}
      </span>
    </span>
  );
}
