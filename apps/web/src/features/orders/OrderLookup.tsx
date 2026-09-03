'use client';

import { useState } from 'react';
import {
  CURRENCY_LABEL, CUSTOMER_JOURNEY, formatPrice, journeyIndex, stateCopy, data as num,
} from '@diyar/i18n';
import { Field } from '@/features/checkout/Field';
import { lookupOrder, type OrderLookupResult } from './actions';

/**
 * Order tracking, without an account.
 *
 * Two factors, neither of them a password: the reference the customer was given
 * and the phone the order was placed on. Requiring a login here would mean
 * building accounts before anyone can see the order they just placed, and the
 * phone is already the identity.
 *
 * THE FAILURE MESSAGE IS DELIBERATELY VAGUE. "No order matches" covers a wrong
 * reference, a wrong phone and a malformed phone with one sentence, because
 * distinguishing them tells whoever is typing which half they got right.
 */
export function OrderLookup() {
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState<OrderLookupResult>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (searching) return;
    setSearching(true);
    setOrder(await lookupOrder(reference, phone));
    setSearched(true);
    setSearching(false);
  };

  if (order) return <OrderDetail order={order} onBack={() => { setOrder(null); setSearched(false); }} />;

  return (
    <form onSubmit={onSubmit} noValidate className="px-5 lg:px-0">
      <p className="mb-7 max-w-proseMax text-small leading-relaxed text-dim lg:text-bodyLg">
        اكتب رقم الطلب ورقم الموبايل الذي طلبت به.
      </p>

      <Field
        label="رقم الطلب" value={reference} onChange={setReference} required
        maxLength={20} hint="مثل DY-4KK3YMDK"
      />
      <Field
        label="رقم الموبايل" value={phone} onChange={setPhone} required
        type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
      />

      {searched && !order && (
        <p role="alert" className="mb-5 border border-hair bg-l1 p-4 text-small leading-relaxed text-dim">
          لا يوجد طلب مطابق. تأكّد من رقم الطلب ورقم الموبايل.
        </p>
      )}

      <button
        type="submit"
        disabled={searching}
        className="relative flex h-control w-full items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 active:opacity-press disabled:opacity-disabled disabled:brightness-75"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
        {searching ? '…جارٍ البحث' : 'تتبّع الطلب'}
      </button>
    </form>
  );
}

function OrderDetail({
  order, onBack,
}: {
  order: NonNullable<OrderLookupResult>;
  onBack(): void;
}) {
  return (
    <div className="px-5 lg:px-0">
      <div className="border border-hair bg-l1 p-5">
        <div className="text-caption tracking-label text-faint">رقم الطلب</div>
        <div className="latin mt-2 select-all text-h3 tracking-[3px] text-brass lg:text-h2Lg">
          {order.reference}
        </div>
        <div className="mt-3 text-caption text-faint">
          باسم {order.contactName} · الدفع عند الاستلام
        </div>
      </div>

      {/*
        One timeline PER HOUSE, not one for the order.

        This is the whole reason tracking is built this way: each house confirms,
        packs and ships independently, so a two-house order genuinely has two
        states at once. Averaging them into a single progress bar would be the
        easy design and would be wrong every time the two disagree — which is
        most of the time.
      */}
      {order.houses.map((house) => {
        const copy = stateCopy(house.state);
        const position = journeyIndex(house.state);

        return (
          <section key={house.reference} className="mt-7 border-t border-hair pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-h4 lg:text-h3">{house.brandName}</h2>
              <span
                className={[
                  'rounded-pill px-3 py-1 text-micro tracking-label',
                  copy.terminal && house.state !== 'delivered'
                    ? 'bg-[#B5697E]/15 text-[#D69AA8]'
                    : 'bg-brass/15 text-brass',
                ].join(' ')}
              >
                {copy.label}
              </span>
            </div>

            <p className="mt-2 text-small leading-relaxed text-dim">{copy.detail}</p>

            {position !== null && (
              <ol className="mt-5 flex gap-1.5" aria-label="مراحل الطلب">
                {CUSTOMER_JOURNEY.map((step, index) => (
                  <li
                    key={step}
                    aria-current={index === position ? 'step' : undefined}
                    className={[
                      'h-[3px] flex-1 rounded-pill transition-colors duration-slow ease-out',
                      index <= position ? 'bg-brass' : 'bg-hair',
                    ].join(' ')}
                  >
                    <span className="sr-only">{stateCopy(step).label}</span>
                  </li>
                ))}
              </ol>
            )}

            {house.trackingNumber && (
              <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-3">
                <span className="text-caption text-faint">رقم الشحنة</span>
                {/* Selectable, because the customer will paste it into the
                    courier's own tracking page. */}
                <span className="latin tnum select-all text-small text-bone">
                  {house.trackingNumber}
                </span>
              </div>
            )}

            <ul className="mt-5">
              {house.items.map((item) => (
                <li key={item.name} className="flex justify-between py-1.5 text-small text-dim">
                  <span>
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="text-faint"> × <span className="tnum">{num(item.quantity)}</span></span>
                    )}
                  </span>
                  <span>
                    <span className="tnum">{formatPrice(item.unitPricePiastres * item.quantity)}</span>
                    <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
                  </span>
                </li>
              ))}
              <li className="flex justify-between py-1.5 text-caption text-faint">
                <span>التوصيل</span>
                <span>
                  <span className="tnum">{formatPrice(house.shippingPiastres)}</span>
                  <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
                </span>
              </li>
            </ul>
          </section>
        );
      })}

      <div className="mt-7 flex items-baseline justify-between border-t border-hair pt-5">
        <span className="font-display text-h4">الإجمالي عند الاستلام</span>
        <span className="text-h3 font-semibold lg:text-h2Lg">
          <span className="tnum">{formatPrice(order.totalPiastres)}</span>
          <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
        </span>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="tappable mt-8 border-b border-brass/50 pb-2 text-bodyLg transition-colors duration-base ease-out hover:border-brass hover:text-brass"
      >
        تتبّع طلب آخر
      </button>
    </div>
  );
}
