import { describe, expect, it } from 'vitest';
import {
  CartPricer,
  MAX_QUANTITY_PER_LINE,
  type CatalogueSnapshot,
  type PricedCartLine,
  type ShippingQuoter,
} from './cart';

import { Money } from '../value-objects/money';
import { InvalidMoney } from '../errors/index';

/** Flat per parcel, so the assertions are about grouping rather than tariffs. */
const flatShipping: ShippingQuoter = {
  quote: () => ({ amount: Money.fromMinor(5_500), etaDaysMin: 2, etaDaysMax: 3 }),
};

const product = (over: Partial<CatalogueSnapshot> = {}): CatalogueSnapshot => ({
  productId: 'p1',
  sellerId: 's1',
  slug: 'layl',
  name: 'ليل القاهرة',
  brandName: 'ميزون نور',
  brandLatin: 'MAISON NOUR',
  sku: 'NUR-LQ-50',
  volumeMl: 50,
  scentFamily: 'amber',
  unitPrice: Money.fromMinor(45_000),
  stock: 12,
  isPublished: true,
  isHouseLive: true,
  fulfilmentHours: 48,
  ...over,
});

const pricer = new CartPricer(flatShipping);

describe('CartPricer — money comes from the catalogue, never from the client', () => {
  it('prices from the catalogue even when the client sends a different price', () => {
    // The whole point of the design: a tampered or stale client price changes
    // nothing about what is charged.
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 2, seenPricePiastres: 1 }],
      [product()],
    );
    expect(cart.merchandise.minor).toBe(90_000);
    expect(cart.houses[0]!.lines[0]!.unitPrice.minor).toBe(45_000);
  });

  it('reports a price change without letting it touch the total', () => {
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1, seenPricePiastres: 39_000 }],
      [product()],
    );
    const changed = cart.adjustments.find((a) => a.reason === 'price_changed');
    expect(changed).toBeDefined();
    expect(changed!.previousPrice!.minor).toBe(39_000);
    expect(changed!.currentPrice!.minor).toBe(45_000);
    expect(cart.total.minor).toBe(45_000 + 5_500);
  });

  it('says nothing when the price is unchanged', () => {
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1, seenPricePiastres: 45_000 }],
      [product()],
    );
    expect(cart.adjustments).toHaveLength(0);
  });
});

describe('CartPricer — one cart, N parcels', () => {
  const twoHouses = [
    product(),
    product({ productId: 'p2', sellerId: 's2', slug: 'ward', name: 'ورد الطائف',
      brandName: 'دار الورد', brandLatin: 'DAR AL WARD', unitPrice: Money.fromMinor(38_000) }),
  ];

  it('groups by house and charges shipping per house', () => {
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
      twoHouses,
    );
    expect(cart.houses).toHaveLength(2);
    // Two parcels, two deliveries. Showing one is a lie the payment screen exposes.
    expect(cart.shipping.minor).toBe(11_000);
    expect(cart.merchandise.minor).toBe(83_000);
    expect(cart.total.minor).toBe(94_000);
  });

  it('keeps several lines from the same house in ONE parcel', () => {
    const sameHouse = [
      product(),
      product({ productId: 'p3', slug: 'other', name: 'عطر آخر' }),
    ];
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1 }, { productId: 'p3', quantity: 1 }],
      sameHouse,
    );
    expect(cart.houses).toHaveLength(1);
    expect(cart.houses[0]!.lines).toHaveLength(2);
    expect(cart.shipping.minor).toBe(5_500);
  });

  it('counts items across every house', () => {
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }],
      twoHouses,
    );
    expect(cart.itemCount).toBe(5);
  });
});

describe('CartPricer — a cart is a promise about a catalogue that moved', () => {
  it('drops an unpublished listing and says so', () => {
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1 }],
      [product({ isPublished: false })],
    );
    expect(cart.isEmpty).toBe(true);
    expect(cart.adjustments[0]!.reason).toBe('no_longer_available');
  });

  it('drops a listing whose house went off-live', () => {
    // A suspended house must stop selling instantly, and the cart is one of the
    // places that is easy to forget.
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1 }],
      [product({ isHouseLive: false })],
    );
    expect(cart.isEmpty).toBe(true);
    expect(cart.adjustments[0]!.reason).toBe('no_longer_available');
  });

  it('drops a product that no longer exists at all', () => {
    const cart = pricer.price([{ productId: 'ghost', quantity: 1 }], []);
    expect(cart.isEmpty).toBe(true);
    expect(cart.adjustments[0]).toMatchObject({ productId: 'ghost', reason: 'no_longer_available' });
  });

  it('reports out of stock separately from unavailable', () => {
    // Different words for the customer: one is coming back, the other is not.
    const cart = pricer.price([{ productId: 'p1', quantity: 1 }], [product({ stock: 0 })]);
    expect(cart.adjustments[0]!.reason).toBe('out_of_stock');
  });

  it('reduces the quantity to the stock on hand rather than refusing the line', () => {
    const cart = pricer.price([{ productId: 'p1', quantity: 5 }], [product({ stock: 2 })]);
    expect(cart.houses[0]!.lines[0]!.quantity).toBe(2);
    expect(cart.merchandise.minor).toBe(90_000);
    expect(cart.adjustments[0]).toMatchObject({
      reason: 'quantity_reduced', requestedQuantity: 5, acceptedQuantity: 2,
    });
  });

  it('caps a line even when stock is deep', () => {
    const cart = pricer.price([{ productId: 'p1', quantity: 40 }], [product({ stock: 500 })]);
    expect(cart.houses[0]!.lines[0]!.quantity).toBe(MAX_QUANTITY_PER_LINE);
    expect(cart.houses[0]!.lines[0]!.maxQuantity).toBe(MAX_QUANTITY_PER_LINE);
  });

  it('keeps the good lines when one line goes bad', () => {
    // The failure that loses the sale is emptying someone's basket because a
    // single item sold out.
    const cart = pricer.price(
      [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
      [product(), product({ productId: 'p2', sellerId: 's2', stock: 0 })],
    );
    expect(cart.houses).toHaveLength(1);
    expect(cart.total.minor).toBe(45_000 + 5_500);
    expect(cart.adjustments).toHaveLength(1);
  });
});

describe('CartPricer — refusals', () => {
  it('refuses a quantity that is not a positive whole number', () => {
    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      expect(() => pricer.price([{ productId: 'p1', quantity }], [product()]), String(quantity))
        .toThrow(InvalidMoney);
    }
  });

  it('prices an empty cart as zero rather than throwing', () => {
    const cart = pricer.price([], []);
    expect(cart.isEmpty).toBe(true);
    expect(cart.total.minor).toBe(0);
    expect(cart.itemCount).toBe(0);
  });
});

describe('CartPricer — the shipping port', () => {
  it('asks the quoter once per house and passes it that house lines', () => {
    const seen: Array<{ sellerId: string; lines: readonly PricedCartLine[] }> = [];
    const spy: ShippingQuoter = {
      quote: (input) => {
        seen.push({ sellerId: input.sellerId, lines: input.lines });
        return { amount: Money.fromMinor(1_000), etaDaysMin: 1, etaDaysMax: 2 };
      },
    };
    new CartPricer(spy).price(
      [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
      [product(), product({ productId: 'p2', sellerId: 's2' })],
    );
    expect(seen).toHaveLength(2);
    expect(seen.map((s) => s.sellerId).sort()).toEqual(['s1', 's2']);
    expect(seen.every((s) => s.lines.length === 1)).toBe(true);
  });

  it('carries each house own delivery window through to the cart', () => {
    const perHouse: ShippingQuoter = {
      quote: ({ sellerId }) =>
        sellerId === 's1'
          ? { amount: Money.fromMinor(5_000), etaDaysMin: 2, etaDaysMax: 3 }
          : { amount: Money.fromMinor(7_500), etaDaysMin: 4, etaDaysMax: 6 },
    };
    const cart = new CartPricer(perHouse).price(
      [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
      [product(), product({ productId: 'p2', sellerId: 's2' })],
    );
    expect(cart.houses.map((h) => [h.etaDaysMin, h.etaDaysMax])).toEqual([[2, 3], [4, 6]]);
    expect(cart.shipping.minor).toBe(12_500);
  });
});
