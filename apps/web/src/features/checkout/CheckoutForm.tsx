'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  counted, CURRENCY_LABEL, DAY, editorial, formatPrice, GOVERNORATE_OPTIONS,
  plural, SHIPMENT, data as num } from '@diyar/i18n';
import { priceCart, type PricedCartResult } from '@/features/cart/actions';
import { useCart } from '@/features/cart/CartStore';
import { Field, SelectField } from './Field';
import { placeOrder, type PlaceOrderResult } from './actions';
import { PrimaryButton } from '@/features/shell/PrimaryButton';

/**
 * Checkout.
 *
 * ONE PAGE, not a wizard. A five-step flow is the right shape when each step
 * genuinely gates the next; here the customer already knows their own name,
 * phone and address, and splitting six inputs across four screens adds three
 * chances to abandon on a phone with a slow connection.
 *
 * NO ACCOUNT REQUIRED. Cash on delivery needs no card and no verified session,
 * so demanding a login here would cost orders to protect nothing. The phone
 * number is the identity: a returning guest is recognised as the same customer
 * without ever having created an account, and when OTP arrives it upgrades
 * these records rather than replacing them.
 */

type Errors = Partial<Record<'contactName' | 'contactPhone' | 'city' | 'area' | 'street' | 'building', string>>;

/**
 * Egyptian mobiles: 010/011/012/015 then eight digits.
 *
 * Validated here for a fast answer and again in the router, which is the one
 * that counts. A rule enforced only in the browser is not enforced.
 */
const PHONE = /^(?:\+20|0)1[0125]\d{8}$/;

export function CheckoutForm() {
  const { entries, hydrated, clear } = useCart();
  const [cart, setCart] = useState<PricedCartResult | null>(null);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [governorate, setGovernorate] = useState<string>(GOVERNORATE_OPTIONS[0]!.value);
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [landmark, setLandmark] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    priceCart(entries).then((priced) => { if (live) setCart(priced); }).catch(() => undefined);
    return () => { live = false; };
  }, [entries, hydrated]);

  const validate = (): boolean => {
    const next: Errors = {};
    if (contactName.trim().length < 2) next.contactName = 'اكتب الاسم كاملًا';
    if (!PHONE.test(contactPhone.trim())) next.contactPhone = 'رقم موبايل مصري غير صحيح';
    if (!city.trim()) next.city = 'مطلوب';
    if (!area.trim()) next.area = 'مطلوب';
    if (!street.trim()) next.street = 'مطلوب';
    if (!building.trim()) next.building = 'مطلوب';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    const placed = await placeOrder({
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      address: {
        governorate,
        city: city.trim(),
        area: area.trim(),
        street: street.trim(),
        building: building.trim(),
        ...(floor.trim() ? { floor: floor.trim() } : {}),
        ...(apartment.trim() ? { apartment: apartment.trim() } : {}),
        ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
      },
      entries,
    });
    setResult(placed);
    // The bag is emptied only on a CONFIRMED order. Clearing it optimistically
    // and then failing would lose the basket and the sale together.
    if (placed.ok) clear();
    setSubmitting(false);
  };

  if (result?.ok) return <Confirmation result={result} />;

  if (!hydrated || cart === null) {
    return <p className="px-5 py-8 text-small text-faint lg:px-0">…جارٍ التحضير</p>;
  }

  if (cart.isEmpty) {
    return (
      <div className="px-5 py-9 text-center lg:px-0">
        <p className="font-display text-h3">حقيبتك فارغة</p>
        <Link
          href="/"
          className="tappable mt-6 inline-block border-b border-brass/50 pb-2 text-bodyLg transition-colors duration-base ease-out hover:border-brass hover:text-brass"
        >
          تصفّح العطور
        </Link>
      </div>
    );
  }



  return (
    <form onSubmit={onSubmit} noValidate className="px-5 lg:px-0">
      {result && !result.ok && (
        <div role="alert" className="mb-6 border border-danger/50 bg-l1 p-4 text-small leading-relaxed text-bone">
          {result.message}
          {result.reason === 'cart_changed' && (
            <Link href="/cart" className="tappable mt-3 block text-brass underline">
              راجع الحقيبة
            </Link>
          )}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-5 font-display text-h3 lg:text-h2Lg">بيانات التواصل</h2>
        <Field
          label="الاسم بالكامل" value={contactName} onChange={setContactName}
          error={errors.contactName} required autoComplete="name" maxLength={80}
        />
        <Field
          label="رقم الموبايل" value={contactPhone} onChange={setContactPhone}
          error={errors.contactPhone} required type="tel" inputMode="tel"
          autoComplete="tel" maxLength={14}
          hint="سيتواصل معك المندوب على هذا الرقم"
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-5 font-display text-h3 lg:text-h2Lg">عنوان التوصيل</h2>
        <SelectField
          label="المحافظة" value={governorate} onChange={setGovernorate}
          options={GOVERNORATE_OPTIONS}
        />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="المدينة" value={city} onChange={setCity} error={errors.city} required autoComplete="address-level2" />
          <Field label="المنطقة" value={area} onChange={setArea} error={errors.area} required />
        </div>
        <Field label="الشارع" value={street} onChange={setStreet} error={errors.street} required autoComplete="address-line1" />
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="رقم العقار" value={building} onChange={setBuilding} error={errors.building} required maxLength={40} />
          <Field label="الدور" value={floor} onChange={setFloor} maxLength={20} />
          <Field label="الشقة" value={apartment} onChange={setApartment} maxLength={20} />
        </div>
        {/*
          Optional in the schema, load-bearing in reality: doc 03 §4 makes failed
          delivery the largest single cost line, and a landmark is what lets a
          courier arrive without phoning. A cost control wearing a UX costume.
        */}
        <Field
          label="علامة مميزة" value={landmark} onChange={setLandmark} maxLength={200}
          hint="يساعد المندوب على الوصول دون اتصال"
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-5 font-display text-h3 lg:text-h2Lg">الدفع</h2>
        {/*
          One method, presented as a statement rather than a radio group with a
          single option. Cash on delivery needs no gateway and no approvals, so
          it is a real launch method — not a placeholder. Card and wallet appear
          here when Paymob is connected.
        */}
        <div className="border border-hair bg-l1 p-4">
          <div className="text-bodyLg">الدفع عند الاستلام</div>
          <p className="mt-2 text-caption leading-relaxed text-faint">
            تدفع نقدًا للمندوب عند تسليم الشحنة. كل دار تشحن طلبها بنفسها.
          </p>
        </div>
      </section>

      <Summary cart={cart} />

      <PrimaryButton type="submit" disabled={submitting} fill="full">
      {submitting ? '…جارٍ تأكيد الطلب' : 'تأكيد الطلب'}
    </PrimaryButton>

      <p className="mt-3 pb-8 text-center text-micro leading-relaxed text-faint">
        بتأكيد الطلب فأنت توافق على شروط البيع وسياسة الإرجاع.
      </p>
    </form>
  );
}

function Summary({ cart }: { cart: PricedCartResult }) {
  return (
    <section className="border-t border-hair pt-5">
      {cart.houses.map((house) => (
        <div key={house.sellerId} className="mb-3 flex justify-between text-small text-dim">
          <span>
            {house.brandName}
            <span className="text-faint">
              {' · '}
              <span className="tnum">{num(house.etaDaysMin)}</span>–
              <span className="tnum">{num(house.etaDaysMax)}</span>{' '}
              {plural(house.etaDaysMax, DAY)}
            </span>
          </span>
          <span>
            <span className="tnum">{formatPrice(house.merchandisePiastres + house.shippingPiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </span>
        </div>
      ))}

      {/*
        The same breakdown the bag showed.

        Checkout listed only per-house totals, so the merchandise and delivery
        split VANISHED between the two screens — the customer sees a figure at
        one step and a different arrangement of the same figure at the next, and
        has to take on trust that they agree. Showing delivery before payment is
        the entire reason the bag is grouped by house; dropping it here undoes
        that one screen before the money.
      */}
      <div className="mt-4 border-t border-hair pt-4">
        <div className="flex justify-between py-1 text-small text-dim">
          <span>المنتجات</span>
          <span>
            <span className="tnum">{formatPrice(cart.merchandisePiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </span>
        </div>
        <div className="flex justify-between py-1 text-small text-dim">
          <span>التوصيل · {counted(cart.houses.length, SHIPMENT, editorial)}</span>
          <span>
            <span className="tnum">{formatPrice(cart.shippingPiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-4">
        <span className="font-display text-h4">الإجمالي</span>
        <span className="text-h3 font-semibold lg:text-h2Lg">
          <span className="tnum">{formatPrice(cart.totalPiastres)}</span>
          <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
        </span>
      </div>
    </section>
  );
}

function Confirmation({ result }: { result: Extract<PlaceOrderResult, { ok: true }> }) {
  return (
    <div className="px-5 py-9 lg:px-0 lg:py-[72px]">
      <div className="latin mb-4 text-micro tracking-label text-brass">ORDER CONFIRMED</div>
      <h2 className="font-display text-h1 leading-heading lg:text-h1Lg">تم استلام طلبك</h2>

      <p className="mt-5 max-w-proseMax text-small leading-relaxed text-dim lg:text-bodyLg">
        {result.houseCount > 1
          ? 'كل دار ستؤكّد طلبها وتشحنه بنفسها، لذا قد تصل الشحنات في أيام مختلفة.'
          : 'ستؤكّد الدار طلبها وتجهّزه للشحن.'}
      </p>

      {/*
        The reference, given the weight it deserves: this is the one string the
        customer will read down a phone line, and its alphabet is chosen so no
        character can be misheard.
      */}
      <div className="mt-7 border border-hair bg-l1 p-5">
        <div className="text-caption tracking-label text-faint">رقم الطلب</div>
        <div className="latin mt-2 select-all text-h2 tracking-[3px] text-brass lg:text-h1Lg">
          {result.reference}
        </div>
        <p className="mt-3 text-caption leading-relaxed text-faint">
          احتفظ به لمتابعة الطلب. ستحتاج إليه مع رقم موبايلك.
        </p>
      </div>

      <dl className="mt-6 border-t border-hair pt-5">
        <div className="flex justify-between py-1.5 text-small text-dim">
          <dt>الإجمالي عند الاستلام</dt>
          <dd>
            <span className="tnum">{formatPrice(result.totalPiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </dd>
        </div>
        <div className="flex justify-between py-1.5 text-small text-dim">
          <dt>الوصول المتوقّع</dt>
          <dd>
            <span className="tnum">{num(result.etaDaysMin)}</span>–
            <span className="tnum">{num(result.etaDaysMax)}</span>{' '}
            {plural(result.etaDaysMax, DAY)}
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
        <Link
          href="/order"
          className="tappable border-b border-brass/50 pb-2 text-bodyLg transition-colors duration-base ease-out hover:border-brass hover:text-brass"
        >
          تتبّع الطلب
        </Link>
        <Link
          href="/"
          className="tappable border-b border-hair pb-2 text-bodyLg text-dim transition-colors duration-base ease-out hover:border-brass hover:text-brass"
        >
          متابعة التصفّح
        </Link>
      </div>
    </div>
  );
}
