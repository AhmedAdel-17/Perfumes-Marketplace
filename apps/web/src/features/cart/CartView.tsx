'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Flacon } from '@/features/product/Flacon';
import {
  counted, CURRENCY_LABEL, DAY, editorial, formatPrice, PERFUME, plural, SHIPMENT,
  data as num,
} from '@diyar/i18n';
import { priceCart, type PricedCartResult } from './actions';
import { useCart } from './CartStore';

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
 */
export function CartView() {
  const { entries, hydrated, setQuantity, remove } = useCart();
  const [cart, setCart] = useState<PricedCartResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

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
    return <p className="px-5 py-8 text-small text-faint lg:px-0">…جارٍ الحساب</p>;
  }

  if (failed) {
    return (
      <div className="px-5 py-8 lg:px-0">
        <p className="text-small leading-relaxed text-dim">
          تعذّر حساب الحقيبة. تحقّق من اتصالك ثم أعد المحاولة.
        </p>
      </div>
    );
  }

  const priced = cart!;

  if (priced.isEmpty) {
    return (
      <div className="px-5 py-9 text-center lg:px-0 lg:py-[88px]">
        <p className="font-display text-h3 lg:text-h2Lg">حقيبتك فارغة</p>
        <p className="mt-3 text-small leading-relaxed text-faint">
          {/* An empty state that only says "empty" is a dead end; it must offer
              the next step, and the next step is the catalogue. */}
          ابدأ من دور العطور المصرية المختارة.
        </p>
        <Link
          href="/"
          className="tappable mt-6 inline-block border-b border-brass/50 pb-2 text-bodyLg text-bone transition-colors duration-base ease-out hover:border-brass hover:text-brass"
        >
          تصفّح العطور
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
        <ul className="mx-5 mb-6 border border-hair bg-l1 p-4 lg:mx-0">
          {priced.adjustments.map((a) => (
            <li key={`${a.productId}-${a.reason}`} className="text-caption leading-relaxed text-dim">
              {a.reason === 'no_longer_available' && `${a.productName || 'أحد المنتجات'} لم يعد متاحًا وأُزيل من الحقيبة.`}
              {a.reason === 'out_of_stock' && `${a.productName} نفد من المخزون وأُزيل من الحقيبة.`}
              {a.reason === 'quantity_reduced' &&
                `${a.productName}: المتاح ${num(a.acceptedQuantity)} فقط من أصل ${num(a.requestedQuantity)}.`}
              {a.reason === 'price_changed' && a.currentPricePiastres !== undefined && (
                <>
                  {`${a.productName}: تغيّر السعر إلى `}
                  <span className="tnum">{formatPrice(a.currentPricePiastres)}</span>
                  <span className="latin ms-1 text-micro tracking-label">{CURRENCY_LABEL}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {priced.houses.map((house) => (
        <section key={house.sellerId} className="mb-7 border-t border-hair px-5 pt-5 lg:px-0">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <div className="latin text-micro tracking-label text-brass">{house.brandLatin}</div>
              <div className="mt-1 font-display text-h4">{house.brandName}</div>
            </div>
            <div className="text-caption text-faint">
              {/* The noun agrees with the LAST number in the range, so a 10–11
                  day window reads "١٠ إلى ١١ يومًا" rather than "…أيام". */}
              يصل خلال <span className="tnum">{num(house.etaDaysMin)}</span>–
              <span className="tnum">{num(house.etaDaysMax)}</span>{' '}
              {plural(house.etaDaysMax, DAY)}
            </div>
          </div>

          <ul>
            {house.lines.map((line) => (
              <li key={line.productId} className="flex gap-4 border-b border-hair/60 py-4 last:border-0">
                <Link href={`/p/${line.slug}`} className="relative block h-[104px] w-[84px] flex-none overflow-hidden bg-[radial-gradient(72%_58%_at_50%_24%,#2A2019,#131010_52%,#070606)]">
                  <Flacon
                    family={line.scentFamily}
                    house={line.brandLatin}
                    uid={`bag-${line.productId}`}
                    className="absolute inset-0 h-full w-full px-[14%] py-[5%]"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/p/${line.slug}`}
                    className="tappable font-display text-h4 leading-tight transition-colors duration-base ease-out hover:text-brass"
                  >
                    {line.name}
                  </Link>
                  <div className="mt-1 text-caption text-faint">
                    <span className="tnum">{num(line.volumeMl)}</span> مل
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Stepper
                      quantity={line.quantity}
                      max={line.maxQuantity}
                      onChange={(q) => setQuantity(line.productId, q)}
                      onRemove={() => remove(line.productId)}
                      label={line.name}
                    />
                    <div className="text-bodyLg font-semibold">
                      <span className="tnum">{formatPrice(line.lineTotalPiastres)}</span>
                      <span className="latin ms-1.5 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-between text-caption text-faint">
            <span>توصيل هذه الدار</span>
            <span>
              <span className="tnum">{formatPrice(house.shippingPiastres)}</span>
              <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
            </span>
          </div>
        </section>
      ))}

      {/* The total, with shipping broken out per house above it, so the number
          at the bottom is never a surprise. */}
      <section className="border-t border-hair px-5 pt-5 lg:px-0">
        <Row label="المنتجات" piastres={priced.merchandisePiastres} />
        {/* "٢ شحنات" is the very mistake @diyar/i18n exists to prevent — two of
            something takes the DUAL, شحنتان, with no numeral in front of it.
            Written here by hand once and caught on screen; it goes through
            counted() like every other counted noun now. */}
        <Row
          label={`التوصيل · ${counted(priced.houses.length, SHIPMENT, editorial)}`}
          piastres={priced.shippingPiastres}
        />
        <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-4">
          <span className="font-display text-h4">الإجمالي</span>
          <span className="text-h3 font-semibold lg:text-h2Lg">
            <span className="tnum">{formatPrice(priced.totalPiastres)}</span>
            <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
          </span>
        </div>
        <p className="mt-2 text-micro text-faint">
          {counted(priced.itemCount, PERFUME, editorial)} · الأسعار شاملة الضريبة
        </p>

        <Link
          href="/checkout"
          className="relative mt-6 flex h-control w-full items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter] duration-base ease-out hover:brightness-110 active:opacity-press"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
          متابعة الشراء
        </Link>
        <p className="mt-3 text-center text-micro text-faint">الدفع عند الاستلام</p>
      </section>
    </div>
  );
}

function Row({ label, piastres }: { label: string; piastres: number }) {
  return (
    <div className="flex justify-between py-1.5 text-small text-dim">
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
  quantity, max, onChange, onRemove, label,
}: {
  quantity: number;
  max: number;
  onChange(quantity: number): void;
  onRemove(): void;
  label: string;
}) {
  const base =
    'tappable flex h-[32px] w-[32px] items-center justify-center rounded-pill border border-hair text-bodyLg text-bone transition-colors duration-base ease-out hover:border-brass hover:text-brass disabled:opacity-disabled disabled:hover:border-hair disabled:hover:text-bone';

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={base}
        aria-label={quantity === 1 ? `إزالة ${label}` : `إنقاص كمية ${label}`}
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
        aria-label={`زيادة كمية ${label}`}
        onClick={() => onChange(quantity + 1)}
      >
        +
      </button>
    </div>
  );
}
