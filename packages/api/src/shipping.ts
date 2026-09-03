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

export const flatRateShipping: ShippingQuoter = {
  quote({ fulfilmentHours }) {
    // The customer's wait is the house's preparation time PLUS the courier's
    // transit, not the courier's alone. Quoting only transit is how a marketplace
    // promises two days and delivers five.
    const prepDays = Math.ceil(fulfilmentHours / 24);
    return {
      amount: Money.fromMinor(FLAT_RATE_PIASTRES),
      etaDaysMin: prepDays + COURIER_DAYS_MIN,
      etaDaysMax: prepDays + COURIER_DAYS_MAX,
    };
  },
};
