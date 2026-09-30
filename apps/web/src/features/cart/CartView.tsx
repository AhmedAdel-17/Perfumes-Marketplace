'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Flacon } from '@/features/product/Flacon';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import {
  CART, countedIn, CURRENCY_LABEL, editorialIn, formatPrice, NOUN, nounIn, data as num,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from '@/features/shell/LocaleProvider';
import { priceCart, type PricedCartResult } from './actions';
import { useCart } from './CartStore';
import { PrimaryHighlight, primarySurface, primarySurfaceStyle } from '@/features/shell/primary-surface';

/**
 * The bag.
 *
 * Every figure on this page came back from the server in the last few hundred
 * milliseconds, computed from catalogue rows read at that moment. Nothing is
 * derived in the browser — not a line total, not the shipping, not the sum. A
 * cart page that adds up its own numbers will eventually disagree with the
 * order, and the customer will be right and we will be wrong.
 *
 * THE STRUCTURE IS THE POINT. The basket is grouped by house, with each house's
 * delivery charge and its own arrival window shown against it, because that is
 * what will physically happen: three houses means three parcels arriving on
 * three days. Marketplaces routinely hide this until the payment step and it is
 * the moment they lose the order — not because the total is high but because it
 * changed after the customer had decided.
 *
 * DESKTOP IS A DIFFERENT COMPOSITION (DESIGN_DOCTRINE §4b). On a phone the
 * summary is the last thing you scroll to, because there is nowhere else for it
 * to be. On a monitor that same stack put the total 900px below the first
 * product and the price of each line 700px from its own name — a phone column
 * stretched, which is the specific failure §4b names. From `lg` the bag becomes
 * two columns: the houses read down the start edge at a comfortable measure,
 * and the summary sits in a panel that STAYS IN VIEW, so the number the visitor
 * is deciding about is never off screen while they change what produced it.
 */
export function CartView() {
  const { entries, hydrated, setQuantity, remove } = useCart();
  const [cart, setCart] = useState<PricedCartResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const locale = useLocale();
  const copy = CART[locale];
  const editorialNum = editorialIn(locale);

  useEffect(() => {
    if (!hydrated) return;
    let current = true;
    setFailed(false);
    startTransition(() => {
      priceCart(entries)
        .then((result) => { if (current) setCart(result); })
        .catch(() => { if (current) setFailed(true); });
    });
    return () => { current = false; };
  }, [entries, hydrated]);

  if (!hydrated || (cart === null && !failed)) {
    return <p className="px-5 py-8 text-small text-ink3 lg:px-0">{copy.pricing}</p>;
  }

  if (failed) {
    return (
      <div className="px-5 py-8 lg:px-0">
        <p className="text-small leading-relaxed text-ink2">
          {copy.failed}
        </p>
      </div>
    );
  }

  const priced = cart!;

  if (priced.isEmpty) {
    return (
      <div className="px-5 py-9 text-center lg:px-0 lg:py-[88px]">
        <p className="font-display text-h3 lg:text-h2Lg">{copy.empty}</p>
        <p className="mt-3 text-small leading-relaxed text-ink3">
          {/* An empty state that only says "empty" is a dead end; it must offer
              the next step, and the next step is the catalogue. */}
          {copy.emptyBody}
        </p>
        <Link
          href={localeHref(locale, '/')}
          className="tappable mt-6 inline-block border-b border-accent/50 pb-2 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
        >
          {copy.browse}
        </Link>
      </div>
    );
  }

  return (
    <div className={pending ? 'opacity-60 transition-opacity duration-quick' : 'transition-opacity duration-quick'}>
      {/* Adjustments come FIRST and are never silent. Something changed since
          the customer put it in the bag, and finding out at the payment step is
          how trust is lost. */}
      {priced.adjustments.length > 0 && (
        <ul className="mx-5 mb-6 border border-line bg-raised p-4 lg:mx-0">
          {priced.adjustments.map((a) => (
            <li key={`${a.productId}-${a.reason}`} className="text-caption leading-relaxed text-ink2">
              {a.reason === 'no_longer_available' && copy.noLongerAvailable(a.productName || copy.aProduct)}
              {a.reason === 'out_of_stock' && copy.outOfStock(a.productName)}
              {a.reason === 'quantity_reduced' &&
                copy.quantityReduced(a.productName, num(a.acceptedQuantity), num(a.requestedQuantity))}
              {a.reason === 'price_changed' && a.currentPricePiastres !== undefined && (
                <>
                  {copy.priceChanged(a.productName)}
                  <span className="tnum">{formatPrice(a.currentPricePiastres)}</span>
                  <span className="latin ms-1 text-micro tracking-label">{CURRENCY_LABEL}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-[68px]">
      <div className="lg:col-span-7">
      {priced.houses.map((house) => (
        <section key={house.sellerId} className="mb-7 border-t border-line px-5 pt-5 lg:px-0">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <div className="latin text-micro tracking-label text-accent">{house.brandLatin}</div>
              <div className="mt-1 font-display text-h4">{house.brandName}</div>
            </div>
            <div className="text-caption text-ink3">
              {/* The noun agrees with the LAST number in the range, so a 10–11
                  day window reads "١٠ إلى ١١ يومًا" rather than "…أيام". */}
              {copy.arrivesIn} <span className="tnum">{num(house.etaDaysMin)}</span>–
              <span className="tnum">{num(house.etaDaysMax)}</span>{' '}
              {nounIn(locale, house.etaDaysMax, NOUN.day)}
            </div>
          </div>

          <ul>
            {house.lines.map((line) => (
              <li key={line.productId} className="flex gap-4 border-b border-line/60 py-4 last:border-0">
                {/*
                  The picture is decorative — the product name sits beside it as
                  its own link — but it is still a LINK, and a link whose only
                  content is an aria-hidden SVG announces itself as nothing. Two
                  links to one place is fine; an unnamed one is not.

                  The house's photograph when it has a verified one, the flacon
                  until then: the same rule as the tile the customer added it
                  from, so the bottle in the bag is the bottle they chose.
                */}
                <Link
                  href={localeHref(locale, `/p/${line.slug}`)}
                  aria-label={line.name}
                  className="relative block h-[104px] w-[84px] flex-none overflow-hidden bg-[radial-gradient(72%_58%_at_50%_24%,theme(colors.stage.glow),theme(colors.stage.mid)_52%,theme(colors.stage.deep))]"
                >
                  {line.photo ? (
                    <ProductPhoto photo={line.photo} sizes="84px" />
                  ) : (
                    <Flacon
                      family={line.scentFamily}
                      house={line.brandLatin}
                      uid={`bag-${line.productId}`}
                      className="absolute inset-0 h-full w-full px-[14%] py-[5%]"
                    />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={localeHref(locale, `/p/${line.slug}`)}
                    className="tappable font-display text-h4 leading-tight transition-colors duration-base ease-out hover:text-accent"
                  >
                    {line.name}
                  </Link>
                  <div className="mt-1 text-caption text-ink3">
                    <span className="tnum">{num(line.volumeMl)}</span> {copy.ml}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Stepper
                      quantity={line.quantity}
                      max={line.maxQuantity}
                      onChange={(q) => setQuantity(line.productId, q)}
                      onRemove={() => remove(line.productId)}
                      label={line.name}
                      copy={copy}
                    />
                    <div className="text-bodyLg font-semibold">
                      <span className="tnum">{formatPrice(line.lineTotalPiastres)}</span>
                      <span className="latin ms-1.5 text-micro tracking-label text-ink2">{CURRENCY_LABEL}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-between text-caption text-ink3">
            <span>{copy.houseDelivery}</span>
            <span>
              <span className="tnum">{formatPrice(house.shippingPiastres)}</span>
              <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
            </span>
          </div>
        </section>
      ))}

      </div>

      {/*
        The total, with shipping broken out per house above it, so the number at
        the bottom is never a surprise.

        `top` clears the sticky masthead plus a hairline of air. Sticking it
        flush to zero tucks the panel's own top rule under the header, which
        reads as a rendering fault rather than as a layout.
      */}
      <section className="border-t border-line px-5 pt-5 lg:sticky lg:top-[110px] lg:col-span-5 lg:border lg:bg-raised lg:px-7 lg:py-7">
        <Row label={copy.products} piastres={priced.merchandisePiastres} />
        {/* "٢ شحنات" is the very mistake @diyar/i18n exists to prevent — two of
            something takes the DUAL, شحنتان, with no numeral in front of it.
            Written here by hand once and caught on screen; it goes through
            counted() like every other counted noun now. */}
        <Row
          label={copy.delivery(countedIn(locale, priced.houses.length, NOUN.shipment, editorialNum))}
          piastres={priced.shippingPiastres}
        />
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="font-display text-h4">{copy.total}</span>
          <span className="text-h3 font-semibold lg:text-h2Lg">
            <span className="tnum">{formatPrice(priced.totalPiastres)}</span>
            <span className="latin ms-2 text-caption tracking-label text-ink2">{CURRENCY_LABEL}</span>
          </span>
        </div>
        <p className="mt-2 text-micro text-ink3">
          {countedIn(locale, priced.itemCount, NOUN.perfume, editorialNum)} · {copy.taxIncluded}
        </p>

        {/* A LINK, not a button: it navigates. Identical surface, correct
            element — middle-click and "open in new tab" have to work. */}
        <Link
          href={localeHref(locale, '/checkout')}
          style={primarySurfaceStyle}
          className={`${primarySurface} mt-6 w-full`}
        >
          <PrimaryHighlight />
          {copy.checkout}
        </Link>
        <p className="mt-3 text-center text-micro text-ink3">{copy.cashOnDelivery}</p>
      </section>
      </div>
    </div>
  );
}

function Row({ label, piastres }: { label: string; piastres: number }) {
  return (
    <div className="flex justify-between py-1.5 text-small text-ink2">
      <span>{label}</span>
      <span>
        <span className="tnum">{formatPrice(piastres)}</span>
        <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
      </span>
    </div>
  );
}

/**
 * Quantity.
 *
 * The visible controls are 32px circles because a 44px one would dominate a
 * cart row; the HIT AREA is expanded past 44pt with `tappable`, which is the
 * rule the doctrine actually states — the target may not shrink, the visual
 * may. Decrementing from one removes the line, so there is no dead "−" and no
 * separate delete control competing for the same corner.
 */
function Stepper({
  quantity, max, onChange, onRemove, label, copy,
}: {
  quantity: number;
  max: number;
  onChange(quantity: number): void;
  onRemove(): void;
  label: string;
  copy: (typeof CART)[keyof typeof CART];
}) {
  const base =
    'tappable flex h-[32px] w-[32px] items-center justify-center rounded-pill border border-line text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled disabled:hover:border-line disabled:hover:text-ink';

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={base}
        aria-label={quantity === 1 ? copy.remove(label) : copy.decrease(label)}
        onClick={() => (quantity === 1 ? onRemove() : onChange(quantity - 1))}
      >
        {quantity === 1 ? '×' : '−'}
      </button>
      <span className="tnum min-w-[18px] text-center text-bodyLg" aria-live="polite">
        {num(quantity)}
      </span>
      <button
        type="button"
        className={base}
        disabled={quantity >= max}
        aria-label={copy.increase(label)}
        onClick={() => onChange(quantity + 1)}
      >
        +
      </button>
    </div>
  );
}
