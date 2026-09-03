/**
 * Cart pricing and reconciliation.
 *
 * Pattern — Ports & Adapters for shipping, around a pure reconciliation
 * function (ENGINEERING_PRINCIPLES §4).
 *
 * WHERE THE CART LIVES, and why it matters more than it looks.
 *
 * The browser holds only `{ productId, quantity }`. It never holds a price that
 * anything is charged from. Every total on every screen is recomputed HERE from
 * catalogue rows read at that moment, because a cart is a promise the customer
 * made hours ago about a catalogue the seller can edit at any time. A client
 * that keeps its own prices will eventually charge one of them, and a
 * marketplace that charges a stale price has taken money for a number nobody
 * currently offers.
 *
 * The browser DOES keep the price it was shown, and that price is used for
 * exactly one thing: detecting that it changed, so the customer is told rather
 * than silently re-billed. It is evidence, never authority. `seenPricePiastres`
 * is compared and reported; it is never summed.
 *
 * MULTI-HOUSE. One cart becomes N parcels, because each house ships its own
 * (CLAUDE.md §7). Shipping is therefore quoted PER HOUSE and not once for the
 * basket — a customer buying from three houses pays three deliveries, and
 * hiding that until the payment screen is the single fastest way to lose them.
 * The grouping here is the same grouping `PlaceOrder` will use, so what the
 * customer sees in the cart is structurally what they will be charged.
 */
import { Money, sumMoney } from '../value-objects/money';
import type { CatalogueSnapshot } from '../ports/repositories';
import { InvalidMoney } from '../errors/index';

/** What the browser sends: identity and intent, never money. */
export interface CartRequestLine {
  readonly productId: string;
  readonly quantity: number;
  /**
   * The price the customer was shown when they added this. Reported back if it
   * has changed. NEVER used in a total — see the header.
   */
  readonly seenPricePiastres?: number | undefined;
}

export type { CatalogueSnapshot };

export type CartAdjustmentReason =
  /** Unknown id, unpublished listing, or a house that is no longer live. */
  | 'no_longer_available'
  | 'out_of_stock'
  | 'quantity_reduced'
  | 'price_changed';

export interface CartAdjustment {
  readonly productId: string;
  readonly productName: string;
  readonly reason: CartAdjustmentReason;
  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly previousPrice?: Money;
  readonly currentPrice?: Money;
}

export interface PricedCartLine {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly brandLatin: string;
  readonly sku: string;
  readonly volumeMl: number;
  readonly scentFamily: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
  /** How many more of this the customer could still add. */
  readonly maxQuantity: number;
}

/** One house, one parcel, one delivery charge. */
export interface PricedCartHouse {
  readonly sellerId: string;
  readonly brandName: string;
  readonly brandLatin: string;
  readonly lines: readonly PricedCartLine[];
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly etaDaysMin: number;
  readonly etaDaysMax: number;
}

export interface PricedCart {
  readonly houses: readonly PricedCartHouse[];
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly total: Money;
  readonly itemCount: number;
  readonly adjustments: readonly CartAdjustment[];
  readonly isEmpty: boolean;
}

/**
 * Port. Shipping is a courier's answer, not ours — Bosta prices by governorate
 * and parcel, and the domain must not pretend to know that tariff.
 */
export interface ShippingQuoter {
  quote(input: {
    readonly sellerId: string;
    readonly lines: readonly PricedCartLine[];
    readonly fulfilmentHours: number;
  }): { readonly amount: Money; readonly etaDaysMin: number; readonly etaDaysMax: number };
}

/** Nobody needs forty of one bottle, and a typo should not become an order. */
export const MAX_QUANTITY_PER_LINE = 10;

export class CartPricer {
  constructor(private readonly shipping: ShippingQuoter) {}

  price(
    requested: readonly CartRequestLine[],
    catalogue: readonly CatalogueSnapshot[],
  ): PricedCart {
    const bySlug = new Map(catalogue.map((c) => [c.productId, c]));
    const adjustments: CartAdjustment[] = [];

    // Grouping is by SELLER, deliberately, not by brand: a house may run more
    // than one brand, and it is the house that packs and ships the parcel.
    const grouped = new Map<string, { snapshot: CatalogueSnapshot; lines: PricedCartLine[] }>();

    for (const line of requested) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new InvalidMoney(
          `Cart quantity must be a positive whole number; got ${line.quantity} for ${line.productId}`,
        );
      }

      const item = bySlug.get(line.productId);

      if (!item || !item.isPublished || !item.isHouseLive) {
        adjustments.push({
          productId: line.productId,
          productName: item?.name ?? '',
          reason: 'no_longer_available',
          requestedQuantity: line.quantity,
          acceptedQuantity: 0,
        });
        continue;
      }

      if (item.stock < 1) {
        adjustments.push({
          productId: item.productId,
          productName: item.name,
          reason: 'out_of_stock',
          requestedQuantity: line.quantity,
          acceptedQuantity: 0,
        });
        continue;
      }

      const cap = Math.min(item.stock, MAX_QUANTITY_PER_LINE);
      const quantity = Math.min(line.quantity, cap);

      if (quantity < line.quantity) {
        adjustments.push({
          productId: item.productId,
          productName: item.name,
          reason: 'quantity_reduced',
          requestedQuantity: line.quantity,
          acceptedQuantity: quantity,
        });
      }

      // Reported, never summed.
      if (
        line.seenPricePiastres !== undefined &&
        line.seenPricePiastres !== item.unitPrice.minor
      ) {
        adjustments.push({
          productId: item.productId,
          productName: item.name,
          reason: 'price_changed',
          requestedQuantity: line.quantity,
          acceptedQuantity: quantity,
          previousPrice: Money.fromMinor(line.seenPricePiastres),
          currentPrice: item.unitPrice,
        });
      }

      const priced: PricedCartLine = {
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        brandName: item.brandName,
        brandLatin: item.brandLatin,
        sku: item.sku,
        volumeMl: item.volumeMl,
        scentFamily: item.scentFamily,
        quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice.times(quantity),
        maxQuantity: cap,
      };

      const bucket = grouped.get(item.sellerId);
      if (bucket) bucket.lines.push(priced);
      else grouped.set(item.sellerId, { snapshot: item, lines: [priced] });
    }

    const houses: PricedCartHouse[] = [...grouped.entries()].map(([sellerId, bucket]) => {
      const merchandise = sumMoney(bucket.lines.map((l) => l.lineTotal));
      const quote = this.shipping.quote({
        sellerId,
        lines: bucket.lines,
        fulfilmentHours: bucket.snapshot.fulfilmentHours,
      });
      return {
        sellerId,
        brandName: bucket.snapshot.brandName,
        brandLatin: bucket.snapshot.brandLatin,
        lines: bucket.lines,
        merchandise,
        shipping: quote.amount,
        etaDaysMin: quote.etaDaysMin,
        etaDaysMax: quote.etaDaysMax,
      };
    });

    const merchandise = sumMoney(houses.map((h) => h.merchandise));
    const shipping = sumMoney(houses.map((h) => h.shipping));

    return {
      houses,
      merchandise,
      shipping,
      total: merchandise.plus(shipping),
      itemCount: houses.reduce((n, h) => n + h.lines.reduce((m, l) => m + l.quantity, 0), 0),
      adjustments,
      isEmpty: houses.length === 0,
    };
  }
}
