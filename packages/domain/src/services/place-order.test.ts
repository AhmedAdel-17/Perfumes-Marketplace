import { describe, expect, it } from 'vitest';
import { Money, sumMoney } from '../value-objects/money';
import { FixedClock } from '../ports/clock';
import { InvalidMoney } from '../errors/index';
import { PlaceOrder, type CartLine, type PlaceOrderInput } from './place-order';
import type { Touch } from '../policies/attribution';

const ORDERED_AT = new Date('2026-09-01T21:42:00Z');
const clock = () => new FixedClock(new Date('2026-09-01T21:42:01Z'));
const egp = (v: string) => Money.fromMajorString(v);
const daysBefore = (n: number) => new Date(ORDERED_AT.getTime() - n * 86_400_000);

const WARD = 'dar-al-ward';
const NOUR = 'maison-nour';
const SIWA = 'atelier-siwa';

const line = (sellerId: string, price: string, qty = 1, name = 'عطر'): CartLine => ({
  productId: `p-${sellerId}-${price}`,
  sellerId,
  productName: name,
  brandName: sellerId,
  sku: `SKU-${price}`,
  volumeMl: 50,
  quantity: qty,
  unitPrice: egp(price),
});

const place = (over: Partial<PlaceOrderInput> = {}) =>
  new PlaceOrder(clock()).build({
    reference: 'DY-24817',
    customerId: 'cust-1',
    contactPhone: '01001234567',
    contactName: 'أحمد',
    lines: [line(NOUR, '450', 2), line(NOUR, '620'), line(WARD, '380'), line(SIWA, '290')],
    shipping: [
      { sellerId: NOUR, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 },
      { sellerId: WARD, amount: egp('50'), etaDaysMin: 3, etaDaysMax: 4 },
      { sellerId: SIWA, amount: egp('40'), etaDaysMin: 4, etaDaysMax: 6 },
    ],
    terms: [NOUR, WARD, SIWA].map((sellerId) => ({
      sellerId, confirmationSlaHours: 24, dispatchSlaHours: 48,
    })),
    paymentMethod: 'cod',
    touches: [],
    priorPurchaseSellerIds: new Set<string>(),
    orderedAt: ORDERED_AT,
    ...over,
  });

describe('the checkout from design-reference/checkout.html', () => {
  it('produces exactly the totals the screen shows', () => {
    const order = place();
    expect(order.merchandise.toMajorString()).toBe('2190.00');   // 900+620+380+290
    expect(order.shipping.toMajorString()).toBe('135.00');       // 45+50+40
    expect(order.total.toMajorString()).toBe('2325.00');
    expect(PlaceOrder.shipmentCount(order)).toBe(3);
  });

  it('fans one cart into one sub-order per house, referenced -A -B -C', () => {
    const order = place();
    expect(order.subOrders.map((s) => s.reference)).toEqual([
      'DY-24817-A', 'DY-24817-B', 'DY-24817-C',
    ]);
    expect(order.subOrders.map((s) => s.sellerId)).toEqual([NOUR, WARD, SIWA]);
  });

  it('keeps each house shipping separate — never merged, never subsidised', () => {
    const order = place();
    expect(order.subOrders.map((s) => s.shipping.toMajorString()))
      .toEqual(['45.00', '50.00', '40.00']);
    expect(sumMoney(order.subOrders.map((s) => s.shipping)).equals(order.shipping)).toBe(true);
  });

  it('carries a delivery estimate per shipment, not one for the order', () => {
    const order = place();
    expect(order.subOrders.map((s) => [s.etaDaysMin, s.etaDaysMax]))
      .toEqual([[2, 3], [3, 4], [4, 6]]);
  });
});

describe('attribution is resolved PER HOUSE, not once for the cart', () => {
  const wardLink: Touch[] = [
    { channel: 'storefront_referral', at: daysBefore(2), ref: WARD, sellerId: WARD },
  ];

  it("the linking house pays the low rate; the others do not", () => {
    const order = place({ touches: wardLink });
    const byId = Object.fromEntries(order.subOrders.map((s) => [s.sellerId, s]));

    expect(byId[WARD]!.attribution.source).toBe('storefront_referral');
    expect(byId[WARD]!.lineItems[0]!.commission.bps).toBe(500);

    // The platform put these in the basket, so they are marketplace-rate.
    expect(byId[NOUR]!.attribution.source).not.toBe('storefront_referral');
    expect(byId[SIWA]!.attribution.source).not.toBe('storefront_referral');
  });

  it('charges each house from its own verdict', () => {
    const order = place({ touches: wardLink });
    const ward = order.subOrders.find((s) => s.sellerId === WARD)!;
    expect(ward.commission.toMajorString()).toBe('19.00');       // 380 @ 5%
  });

  it('a returning customer of one house gets direct_repeat for that house only', () => {
    const order = place({
      touches: [{ channel: 'direct', at: ORDERED_AT }],
      priorPurchaseSellerIds: new Set([NOUR]),
    });
    const byId = Object.fromEntries(order.subOrders.map((s) => [s.sellerId, s]));
    expect(byId[NOUR]!.attribution.source).toBe('direct_repeat');
    expect(byId[WARD]!.attribution.source).toBe('unknown');
  });

  it('the order-level source is the largest sub-order, but billing never uses it', () => {
    const order = place({ touches: wardLink });
    const largest = order.subOrders.find((s) => s.sellerId === NOUR)!;   // 1520
    expect(order.source).toBe(largest.attribution.source);

    // Ward still pays its own 5% regardless of the order-level label.
    const ward = order.subOrders.find((s) => s.sellerId === WARD)!;
    expect(ward.lineItems[0]!.commission.bps).toBe(500);
  });
});

describe('commission is snapshotted onto every line at purchase', () => {
  it('records source, rate and rule-set version on each line item', () => {
    const order = place();
    for (const s of order.subOrders) {
      for (const li of s.lineItems) {
        expect(li.commission.bps).toBeGreaterThan(0);
        expect(li.commission.source).toBe(s.attribution.source);
        expect(li.commission.ruleSetVersion).toBe(1);
      }
    }
  });

  it('sub-order commission equals the sum of its line commissions', () => {
    for (const s of place().subOrders) {
      expect(sumMoney(s.lineItems.map((i) => i.commissionAmount)).equals(s.commission)).toBe(true);
    }
  });

  it('multiplies by quantity correctly', () => {
    const order = place();
    const nour = order.subOrders.find((s) => s.sellerId === NOUR)!;
    const twoPack = nour.lineItems.find((i) => i.quantity === 2)!;
    expect(twoPack.line.toMajorString()).toBe('900.00');
    expect(nour.merchandise.toMajorString()).toBe('1520.00');
  });
});

describe('SLA clocks start at purchase', () => {
  it('gives each house its own confirmation deadline from its own terms', () => {
    const order = place({
      terms: [
        { sellerId: NOUR, confirmationSlaHours: 24, dispatchSlaHours: 48 },
        { sellerId: WARD, confirmationSlaHours: 12, dispatchSlaHours: 24 },
        { sellerId: SIWA, confirmationSlaHours: 48, dispatchSlaHours: 72 },
      ],
    });
    const byId = Object.fromEntries(order.subOrders.map((s) => [s.sellerId, s]));
    expect(byId[WARD]!.confirmDueAt.toISOString()).toBe('2026-09-02T09:42:00.000Z');
    expect(byId[NOUR]!.confirmDueAt.toISOString()).toBe('2026-09-02T21:42:00.000Z');
    expect(byId[SIWA]!.confirmDueAt.toISOString()).toBe('2026-09-03T21:42:00.000Z');
  });
});

describe('invariants — a malformed order cannot exist even briefly', () => {
  it('refuses an empty cart', () => {
    expect(() => place({ lines: [] })).toThrow(InvalidMoney);
  });

  it('refuses to guess a missing shipping quote — that would be a hidden cost', () => {
    expect(() =>
      place({
        shipping: [{ sellerId: NOUR, amount: egp('45'), etaDaysMin: 2, etaDaysMax: 3 }],
      }),
    ).toThrow(/No shipping quote/);
  });

  it('refuses a house with no operating terms', () => {
    expect(() =>
      place({ terms: [{ sellerId: NOUR, confirmationSlaHours: 24, dispatchSlaHours: 48 }] }),
    ).toThrow(/No operating terms/);
  });

  it('refuses a fractional quantity', () => {
    expect(() => place({ lines: [{ ...line(NOUR, '450'), quantity: 1.5 }] })).toThrow(InvalidMoney);
  });

  it('refuses a discount larger than the order', () => {
    expect(() => place({ discount: egp('99999') })).toThrow(/negative/);
  });

  it('the total always reconciles — the same rule as the DB constraint', () => {
    const order = place({ discount: egp('100') });
    expect(order.total.equals(order.merchandise.plus(order.shipping).minus(order.discount))).toBe(true);
    expect(order.total.toMajorString()).toBe('2225.00');
  });

  it('a single-seller cart still produces exactly one sub-order', () => {
    const order = place({
      lines: [line(WARD, '380')],
      shipping: [{ sellerId: WARD, amount: egp('50'), etaDaysMin: 3, etaDaysMax: 4 }],
      terms: [{ sellerId: WARD, confirmationSlaHours: 24, dispatchSlaHours: 48 }],
    });
    expect(PlaceOrder.shipmentCount(order)).toBe(1);
    expect(order.total.toMajorString()).toBe('430.00');
  });
});
