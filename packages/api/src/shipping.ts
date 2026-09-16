import { Money, type ShippingQuoter } from '@diyar/domain';

/**
 * Interim shipping tariff.
 *
 * Pattern — Adapter behind the domain's `ShippingQuoter` port.
 *
 * Bosta prices by governorate, weight and parcel, and that integration is not
 * built yet. Rather than let a placeholder leak into the domain, the domain
 * asks a port and this is the adapter answering with a flat national rate.
 * Replacing it with the real tariff is a new file and one line of wiring; no
 * cart, checkout or order code changes.
 *
 * The rate is stated ONCE, here. It is not configuration yet because a value
 * that lives in exactly one place and is read by one adapter is not yet
 * suffering from being hardcoded — it becomes configuration when operations
 * need to change it without a deploy, which is the trigger recorded against it.
 *
 * IMPORTANT: this is per HOUSE, not per order. Each house packs and ships its
 * own parcel, so a basket spanning three houses genuinely costs three
 * deliveries. Averaging that into one line would understate the total on the
 * cart page and overstate it at checkout.
 */
const FLAT_RATE_PIASTRES = 5_500;

/** The window the courier commits to once a house has dispatched. */
const COURIER_DAYS_MIN = 1;
const COURIER_DAYS_MAX = 2;

/**
 * The window a customer is promised, from a house's preparation time.
 *
 * The customer's wait is the house's preparation PLUS the courier's transit,
 * not the courier's alone. Quoting only transit is how a marketplace promises
 * two days and delivers five.
 *
 * EXPORTED BECAUSE THE PRODUCT PAGE QUOTES IT TOO. It used to compute its own —
 * `ceil(hours / 24)` to that plus one — which left the courier's first day out
 * entirely: the page a customer DECIDES on said "يصل خلال ٢ إلى ٣ أيام" while
 * the bag, the checkout and the confirmation of that same purchase all said
 * "٣–٤ أيام". Two formulas for one promise, and no test compared them. Found by
 * walking the purchase, not by a failing test.
 */
export function arrivalWindow(fulfilmentHours: number): { min: number; max: number } {
  const prepDays = Math.ceil(fulfilmentHours / 24);
  return { min: prepDays + COURIER_DAYS_MIN, max: prepDays + COURIER_DAYS_MAX };
}

export const flatRateShipping: ShippingQuoter = {
  quote({ fulfilmentHours }) {
    const { min, max } = arrivalWindow(fulfilmentHours);
    return {
      amount: Money.fromMinor(FLAT_RATE_PIASTRES),
      etaDaysMin: min,
      etaDaysMax: max,
    };
  },
};
