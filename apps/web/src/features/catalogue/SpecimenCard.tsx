import Link from 'next/link';
import type { ProductCard } from '@/core/catalogue';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { BandReading } from './BandReading';
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
 * One perfume as a SPECIMEN (identity v2 — `.item` in 04-laboratoire.html):
 * a paper card with its photograph, its name, the three facts a comparison
 * turns on, and its price.
 *
 * The idea the identity is built on is that the catalogue schema IS the look:
 * family, strength and longevity are printed as a label's rows, in the same
 * order on every card, so a grid of them can be read across like a register.
 * Longevity always carries its source — see BandReading.
 *
 * The rows step aside below `sm`. Two columns at 360px leave a card about 160px
 * wide, where three label rows become three lines of wrapped fragments; the
 * name and the price are what a phone grid is for, and the product page has
 * the rest.
 *
 * Hover darkens the frame and eases the photograph in by 4% over the slow
 * duration. Nothing lifts and nothing gains a shadow: depth is value, never
 * shadow (DESIGN_DOCTRINE).
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
  const strength = [labelOf(CONCENTRATION, locale, product.concentration), `${num(product.volumeMl)} ${PRODUCT[locale].ml}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={localeHref(locale, `/p/${product.slug}`)}
      className="group flex h-full flex-col border border-line bg-raised transition-colors duration-base ease-out hover:border-ink"
    >
      <div className="relative aspect-square overflow-hidden border-b border-line bg-plate">
        {product.photo ? (
          <ProductPhoto
            photo={product.photo}
            sizes={sizes}
            className="transition-transform duration-slow ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <Flacon
            family={product.family}
            house={product.brandLatin}
            uid={`card-${product.id}`}
            className="absolute inset-0 h-full w-full px-[22%] py-[8%]"
          />
        )}
      </div>

      <div className="px-4 pb-3 pt-4">
        <span className="latin block text-micro tracking-label text-ink3 lg:text-caption">{product.brandLatin}</span>
        <span {...langAttrs(locale, name.lang)} className="mt-0.5 block font-display text-h4 leading-heading transition-colors duration-base ease-out group-hover:text-accent lg:text-h3">
          {name.text}
        </span>
      </div>

      <dl className="hidden border-t border-line text-small sm:block">
        <Row label={copy.family}>{labelOf(SCENT_FAMILY, locale, product.family)}</Row>
        {strength && <Row label={copy.strength}>{strength}</Row>}
        {product.longevity && (
          <Row label={PRODUCT[locale].longevity}>
            <BandReading kind="longevity" reading={product.longevity} locale={locale} meter={false} />
          </Row>
        )}
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <span className="text-bodyLg">
          <span className="tnum">{formatPrice(product.pricePiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </span>
        {rating && rating.count > 0 && rating.overall !== null && (
          <span className="text-small text-ink2">
            <span className="tnum">{rating.overall.toFixed(1)}</span>{' '}
            <span className="tnum">{copy.reviewsCount(num(rating.count))}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-baseline gap-3 border-b border-line px-4 py-1.5 last:border-b-0">
      <dt className="text-ink3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
