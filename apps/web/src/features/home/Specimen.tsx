import Link from 'next/link';
import type { HouseDetail, ProductDetail } from '@/core/catalogue';
import { AddToBag } from '@/features/cart/AddToBag';
import { BandReading } from '@/features/catalogue/BandReading';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import { primarySurface } from '@/features/shell/primary-surface';
import {
  CONCENTRATION, CURRENCY_LABEL, data as num, formatPrice, HOME, HOUSES, labelOf, langAttrs,
  languageOf, pick, PRODUCT, type Locale,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';

/**
 * The opening's specimen label (identity v2 — `.spec` in 04-laboratoire.html):
 * the curated perfume, printed the way the register prints every perfume.
 *
 * It opens the site with the PROOF rather than the claim. The headline beside
 * it says every perfume comes with its source; this card is one, with the
 * source line under its longevity, before the visitor has scrolled at all.
 *
 * THE STAMP. "Verified 8 / 8" is true of every perfume on the site, which is
 * exactly why it may be printed on this one: `sellers_verification_gate`
 * (migration 0001) refuses to put a house live until all eight controls are
 * approved, so a perfume from a house that is not 8 / 8 cannot be published,
 * let alone curated. `total` is the number of controls the page lists, which
 * a test holds equal to the database's enum.
 */
export function Specimen({
  product, house, locale, total, arrival,
}: {
  product: ProductDetail;
  /** The house, for its city and founding year. Null if it could not be read. */
  house: HouseDetail | null;
  locale: Locale;
  /** How many verification controls exist. */
  total: number;
  /** The arrival window the bag and the checkout quote — `arrivalWindow`. */
  arrival: { min: number; max: number };
}) {
  const copy = HOME[locale];
  const words = PRODUCT[locale];
  const name = pick(locale, product.name, product.nameEn);
  const houseName = pick(locale, product.brandName, product.brandNameEn);
  const href = localeHref(locale, `/p/${product.slug}`);

  const notes = (list: readonly string[]) => list.map((note, i) => {
    const english = locale === 'en' ? product.noteEnglish[note] : undefined;
    return (
      <span key={note}>
        {i > 0 && copy.listSeparator}
        {english ?? <span {...langAttrs(locale, 'ar')}>{note}</span>}
      </span>
    );
  });

  // Each fact its own span: the city is whatever the house typed, usually
  // Arabic, and on the English page it has to be marked as such.
  const facts: Array<{ text: string; lang: Locale }> = [];
  if (house?.city) facts.push({ text: house.city, lang: languageOf(house.city) });
  if (house?.foundedYear) facts.push({ text: HOUSES[locale].since(num(house.foundedYear, false)), lang: locale });

  return (
    <article aria-labelledby="specimen-name" className="relative border border-ink bg-raised">
      <div className="latin flex justify-between border-b border-ink px-4 py-2 text-micro tracking-label text-ink2">
        <span>{copy.specimen.toUpperCase()}</span>
        <span>{product.brandLatin}</span>
      </div>

      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[5/4] overflow-hidden border-b border-ink bg-plate">
        {product.photo ? (
          <ProductPhoto photo={product.photo} sizes="(min-width: 1024px) 40vw, 100vw" priority />
        ) : (
          <Flacon
            family={product.family}
            house={product.brandLatin}
            uid="specimen"
            className="absolute inset-0 h-full w-full px-[30%] py-[6%]"
          />
        )}
      </Link>

      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-4">
        <Link href={href} className="tappable transition-colors duration-base ease-out hover:text-accent">
          <h2 id="specimen-name" {...langAttrs(locale, name.lang)} className="font-display text-h3 leading-heading lg:text-h3Lg">
            {name.text}
          </h2>
        </Link>
        <span className="shrink-0 text-small text-ink2">
          {labelOf(CONCENTRATION, locale, product.concentration)}
          {' · '}
          <span className="tnum">{num(product.volumeMl)}</span> {words.ml}
        </span>
      </div>
      <p className="px-4 pb-3 text-small text-ink2 lg:text-body">
        <span {...langAttrs(locale, houseName.lang)}>{houseName.text}</span>
        {facts.map((fact) => (
          <span key={fact.text}>
            {' · '}
            <span {...langAttrs(locale, fact.lang)}>{fact.text}</span>
          </span>
        ))}
      </p>

      <dl className="border-t border-line text-small lg:text-body">
        {product.notesTop.length > 0 && <Row label={words.topNotes}>{notes(product.notesTop)}</Row>}
        {product.notesHeart.length > 0 && <Row label={words.heartNotes}>{notes(product.notesHeart)}</Row>}
        {product.notesBase.length > 0 && <Row label={words.baseNotes}>{notes(product.notesBase)}</Row>}
        {product.longevity && (
          <Row label={words.longevity}>
            <BandReading kind="longevity" reading={product.longevity} locale={locale} />
          </Row>
        )}
        <Row label={copy.delivery}>{copy.arrives(num(arrival.min), num(arrival.max))}</Row>
      </dl>

      <div className="flex items-center justify-between gap-4 border-t border-ink px-4 py-3">
        <span className="text-h4">
          <span className="tnum">{formatPrice(product.pricePiastres)}</span>
          <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </span>
        <AddToBag
          productId={product.id}
          pricePiastres={product.pricePiastres}
          inStock={product.inStock}
          className={`${primarySurface} px-5`}
        />
      </div>

      {/* Latin in both languages, like every label on the page. Rotated a few
          degrees because a stamp is applied by hand; it is the one thing on the
          page allowed to be out of square. */}
      <span className="latin pointer-events-none absolute end-3 top-[52px] -rotate-[8deg] border-[1.5px] border-accent bg-raised px-2 py-1 text-center text-micro leading-normal tracking-label text-accent lg:-start-[18px] lg:end-auto lg:top-[46%]">
        {copy.verifiedStamp.toUpperCase()}
        <br />
        <span className="tnum">{total} / {total}</span>
      </span>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-baseline gap-3 border-b border-line px-4 py-2 last:border-b-0 lg:grid-cols-[120px_1fr]">
      <dt className="text-ink3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
