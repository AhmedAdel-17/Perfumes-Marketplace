'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  CHECKOUT, countedIn, CURRENCY_LABEL, editorialIn, formatPrice, governorateOptions, langAttrs,
  NOUN, nounIn, data as num, pick, type Locale,
} from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from '@/features/shell/LocaleProvider';
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
  const locale = useLocale();
  const copy = CHECKOUT[locale];
  const governorates = governorateOptions(locale);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [governorate, setGovernorate] = useState<string>(governorates[0]!.value);
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
    if (contactName.trim().length < 2) next.contactName = copy.errorName;
    if (!PHONE.test(contactPhone.trim())) next.contactPhone = copy.errorPhone;
    if (!city.trim()) next.city = copy.errorRequired;
    if (!area.trim()) next.area = copy.errorRequired;
    if (!street.trim()) next.street = copy.errorRequired;
    if (!building.trim()) next.building = copy.errorRequired;
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

  if (result?.ok) return <Confirmation result={result} locale={locale} />;

  if (!hydrated || cart === null) {
    return (
      <div className="px-5 lg:px-0">
        <Heading title={copy.title} />
        <p className="py-8 text-body text-ink3">{copy.preparing}</p>
      </div>
    );
  }

  if (cart.isEmpty) {
    return (
      <div className="px-5 lg:px-0">
        <Heading title={copy.title} />
        <div className="border border-line bg-raised px-6 py-9 text-center">
          <p className="font-display text-h3">{copy.empty}</p>
          {/* To the catalogue, as the bag's empty state does. */}
          <Link
            href={localeHref(locale, '/search')}
            className="tappable mt-5 inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
          >
            <span className="border-b border-current">{copy.browse}</span>
          </Link>
        </div>
      </div>
    );
  }



  return (
    /*
      Two columns from `lg`, and the reason is not that the screen is wide.

      Stacked, the summary sat 1,700px below the top of the form: the visitor
      confirmed an amount they had last seen on the previous page. "No hidden
      costs" (doc 04 gate 2) is not only about disclosing a figure, it is about
      the figure being IN VIEW at the moment of the decision. So the summary
      becomes a panel that follows the form down, and the confirm button lives
      inside it, next to the number it commits to.

      Below `lg` nothing changes: on a phone there is one column and the
      summary sits immediately above the button, which is the same guarantee
      expressed the only way a phone can.
    */
    <form
      onSubmit={onSubmit}
      noValidate
      className="px-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-[68px] lg:px-0"
    >
      <Heading title={copy.title} />
      {result && !result.ok && (
        <div role="alert" className="mb-6 border border-danger bg-raised p-4 text-body leading-relaxed text-ink lg:col-span-12">
          {result.message}
          {result.reason === 'cart_changed' && (
            <Link href={localeHref(locale, '/cart')} className="tappable mt-2 flex min-h-touch items-center text-ink hover:text-accent">
              <span className="border-b border-current">{copy.reviewBag}</span>
            </Link>
          )}
        </div>
      )}

      <div className="lg:col-span-7">
      <section aria-labelledby="step-contact" className="mb-8">
        <Step id="step-contact" index="01" title={copy.contact} />
        <Field
          label={copy.fullName} value={contactName} onChange={setContactName}
          error={errors.contactName} required autoComplete="name" maxLength={80}
        />
        <Field
          label={copy.phone} value={contactPhone} onChange={setContactPhone}
          error={errors.contactPhone} required type="tel" inputMode="tel"
          autoComplete="tel" maxLength={14}
          hint={copy.phoneHint}
        />
      </section>

      <section aria-labelledby="step-address" className="mb-8">
        <Step id="step-address" index="02" title={copy.address} />
        <SelectField
          label={copy.governorate} value={governorate} onChange={setGovernorate}
          options={governorates}
        />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={copy.city} value={city} onChange={setCity} error={errors.city} required autoComplete="address-level2" />
          <Field label={copy.area} value={area} onChange={setArea} error={errors.area} required />
        </div>
        <Field label={copy.street} value={street} onChange={setStreet} error={errors.street} required autoComplete="address-line1" />
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label={copy.building} value={building} onChange={setBuilding} error={errors.building} required maxLength={40} />
          <Field label={copy.floor} value={floor} onChange={setFloor} maxLength={20} />
          <Field label={copy.apartment} value={apartment} onChange={setApartment} maxLength={20} />
        </div>
        {/*
          Optional in the schema, load-bearing in reality: doc 03 §4 makes failed
          delivery the largest single cost line, and a landmark is what lets a
          courier arrive without phoning. A cost control wearing a UX costume.
        */}
        <Field
          label={copy.landmark} value={landmark} onChange={setLandmark} maxLength={200}
          hint={copy.landmarkHint}
        />
      </section>

      <section aria-labelledby="step-payment" className="mb-8">
        <Step id="step-payment" index="03" title={copy.payment} />
        {/*
          One method, presented as a statement rather than a radio group with a
          single option. Cash on delivery needs no gateway and no approvals, so
          it is a real launch method — not a placeholder. Card and wallet appear
          here when Paymob is connected.
        */}
        <div className="border border-ink bg-raised p-4">
          <div className="text-bodyLg">{copy.cashOnDelivery}</div>
          <p className="mt-2 text-body leading-relaxed text-ink2">
            {copy.cashOnDeliveryBody}
          </p>
        </div>
      </section>
      </div>

      {/* The same ruled summary panel as the bag, so the figure the visitor
          confirms looks exactly like the one they decided on. */}
      <div className="mb-8 border border-ink bg-raised lg:sticky lg:top-[110px] lg:col-span-5 lg:mb-0">
        <h2 className="latin border-b border-ink px-4 py-2 text-micro tracking-label text-ink2">
          {copy.summary.toUpperCase()}
        </h2>
        <div className="px-4 pb-5 pt-4 lg:px-6 lg:pb-6">
        <Summary cart={cart} locale={locale} />

        <PrimaryButton type="submit" disabled={submitting} fill="full">
          {submitting ? copy.placing : copy.place}
        </PrimaryButton>

        <p className="mt-3 text-center text-small leading-relaxed text-ink3">
          {copy.agreement}
        </p>
        </div>
      </div>
    </form>
  );
}

/**
 * The page's one heading, rendered by whichever branch is on screen.
 *
 * Every state this route can be in — loading, empty bag, the form, an error —
 * needs a level-1 heading, and a route that renders none in two of its four
 * states is a page a screen-reader user cannot orient in. Keeping it in one
 * component is also what stops the four copies drifting apart.
 */
function Heading({ title }: { title: string }) {
  const kicker = CHECKOUT[useLocale()].kicker;
  // Identity v2: the register's page head, ruled at full strength.
  return (
    <header className="mb-6 border-b border-ink pb-4 pt-8 lg:col-span-12 lg:mb-8 lg:pt-12">
      <span className="latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
        {kicker.toUpperCase()}
        <span aria-hidden="true" className="h-px w-12 bg-current" />
      </span>
      <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{title}</h1>
    </header>
  );
}

/**
 * A numbered step of the form: the register's section head at the size of a
 * form, so the three steps read as 01, 02, 03 of one document.
 */
function Step({ id, index, title }: { id: string; index: string; title: string }) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-ink pb-3">
      <span className="latin text-small text-ink3 tnum">{index}</span>
      <h2 id={id} className="font-display text-h3 lg:text-h2Lg">{title}</h2>
    </div>
  );
}

function Summary({ cart, locale }: { cart: PricedCartResult; locale: Locale }) {
  const copy = CHECKOUT[locale];
  return (
    // The rule separates the summary from the form on a phone. Inside the
    // desktop panel the panel's own border already does that job, and two
    // lines 1px apart is the kind of detail the doctrine calls a misaligned
    // hairline.
    <section>
      {cart.houses.map((house) => (
        <div key={house.sellerId} className="mb-3 flex justify-between gap-3 text-body text-ink2">
          <span>
            <span {...langAttrs(locale, pick(locale, house.brandName, house.brandNameEn).lang)}>
              {pick(locale, house.brandName, house.brandNameEn).text}
            </span>
            <span className="text-ink3">
              {' · '}
              <span className="tnum">{num(house.etaDaysMin)}</span>–
              <span className="tnum">{num(house.etaDaysMax)}</span>{' '}
              {nounIn(locale, house.etaDaysMax, NOUN.day)}
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
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex justify-between py-1 text-body text-ink2">
          <span>{copy.products}</span>
          <span>
            <span className="tnum">{formatPrice(cart.merchandisePiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </span>
        </div>
        <div className="flex justify-between py-1 text-body text-ink2">
          <span>{copy.delivery(countedIn(locale, cart.houses.length, NOUN.shipment, editorialIn(locale)))}</span>
          <span>
            <span className="tnum">{formatPrice(cart.shippingPiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </span>
        </div>
      </div>

      <div className="mb-5 mt-3 flex items-baseline justify-between border-t border-ink pt-4">
        <span className="font-display text-h4">{copy.total}</span>
        <span className="text-h3 lg:text-h2Lg">
          <span className="tnum">{formatPrice(cart.totalPiastres)}</span>
          <span className="latin ms-2 text-caption tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </span>
      </div>
    </section>
  );
}

function Confirmation(
  { result, locale }: { result: Extract<PlaceOrderResult, { ok: true }>; locale: Locale },
) {
  const copy = CHECKOUT[locale];
  const heading = useRef<HTMLHeadingElement>(null);

  /*
   * The page is replaced under a viewport still scrolled to where "place order"
   * was — on a phone, the foot of a long form — so the customer landed partway
   * down a now-short confirmation with its title under the sticky masthead.
   * Back to the top, and focus on the heading: it is also how a screen reader
   * learns the order went through, since nothing announced the swap.
   */
  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    // Capped at the prose measure. The page frame is the full content width so
    // the checkout can hold two columns; a confirmation is one short column of
    // reading and stretching it to 1240px would be the opposite mistake to the
    // one §4b describes, made on the same page.
    <div className="max-w-proseMax px-5 py-9 lg:px-0 lg:py-[72px]">
      <div className="latin mb-4 text-micro tracking-label text-accent">ORDER CONFIRMED</div>
      <h1 ref={heading} tabIndex={-1} className="font-display text-h1 leading-heading focus:outline-none lg:text-h1Lg">{copy.confirmedTitle}</h1>

      <p className="mt-5 max-w-proseMax text-body leading-relaxed text-ink2 lg:text-bodyLg">
        {result.houseCount > 1
          ? copy.confirmedManyHouses
          : copy.confirmedOneHouse}
      </p>

      {/*
        The reference, given the weight it deserves: this is the one string the
        customer will read down a phone line, and its alphabet is chosen so no
        character can be misheard.
      */}
      <div className="mt-7 border border-ink bg-raised p-5">
        {/* No tracking: Arabic on the Arabic site (CLAUDE.md §15). */}
        <div className="text-body text-ink2">{copy.reference}</div>
        <div className="latin mt-2 select-all text-h2 tracking-[3px] text-accent lg:text-h1Lg">
          {result.reference}
        </div>
        <p className="mt-3 text-small leading-relaxed text-ink3">
          {copy.referenceHint}
        </p>
      </div>

      <dl className="mt-6 border-t border-line pt-5">
        <div className="flex justify-between py-1.5 text-body text-ink2">
          <dt>{copy.totalOnDelivery}</dt>
          <dd>
            <span className="tnum">{formatPrice(result.totalPiastres)}</span>
            <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
          </dd>
        </div>
        <div className="flex justify-between py-1.5 text-body text-ink2">
          <dt>{copy.expectedArrival}</dt>
          <dd>
            <span className="tnum">{num(result.etaDaysMin)}</span>–
            <span className="tnum">{num(result.etaDaysMax)}</span>{' '}
            {nounIn(locale, result.etaDaysMax, NOUN.day)}
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
        <Link
          href={localeHref(locale, '/order')}
          className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
        >
          <span className="border-b border-current">{copy.track}</span>
        </Link>
        <Link
          href={localeHref(locale, '/')}
          className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink2 transition-colors duration-base ease-out hover:text-accent"
        >
          <span className="border-b border-current">{copy.keepBrowsing}</span>
        </Link>
      </div>
    </div>
  );
}
