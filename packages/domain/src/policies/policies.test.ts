import { describe, expect, it } from 'vitest';
import { Money, sumMoney } from '../value-objects/money';
import { CommissionPolicy, DEFAULT_RATES, ORDER_SOURCES } from './commission';
import { AttributionResolver, type Touch } from './attribution';
import { FixedClock } from '../ports/clock';

const ORDERED_AT = new Date('2026-09-01T18:00:00Z');
const clock = () => new FixedClock(new Date('2026-09-01T18:00:05Z'));
const daysBefore = (n: number) => new Date(ORDERED_AT.getTime() - n * 86_400_000);

describe('commission — the asymmetric model', () => {
  it('charges seller-owned demand far less than platform-created demand', () => {
    const p = new CommissionPolicy();
    expect(p.rateFor('storefront_referral')).toBe(500);
    expect(p.rateFor('direct_repeat')).toBe(500);
    expect(p.rateFor('organic_search')).toBe(1500);
    expect(p.rateFor('paid_campaign')).toBe(1800);
  });

  it('resolves ambiguity in favour of the house', () => {
    expect(new CommissionPolicy().rateFor('unknown')).toBe(500);
  });

  it('every declared source has a rate', () => {
    for (const s of ORDER_SOURCES) {
      expect(DEFAULT_RATES[s]).toBeTypeOf('number');
      expect(Number.isInteger(DEFAULT_RATES[s])).toBe(true);
    }
  });

  it('a per-seller override beats the default', () => {
    const p = new CommissionPolicy({
      version: 2,
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      defaults: DEFAULT_RATES,
      overrides: [{ sellerId: 'dar-al-ward', source: 'organic_search', bps: 1200 }],
    });
    expect(p.rateFor('organic_search', 'dar-al-ward')).toBe(1200);
    expect(p.rateFor('organic_search', 'maison-nour')).toBe(1500);
    expect(p.rateFor('paid_campaign', 'dar-al-ward')).toBe(1800);
  });
});

describe('commission — snapshots keep old statements reproducible', () => {
  it('charges from the snapshot, not from the current rules', () => {
    const july = new CommissionPolicy();
    const snapshot = july.snapshot('organic_search');
    expect(snapshot.bps).toBe(1500);

    // Rates change in September.
    const september = new CommissionPolicy({
      version: 4,
      effectiveFrom: new Date('2026-09-01T00:00:00Z'),
      defaults: { ...DEFAULT_RATES, organic_search: 1800 },
      overrides: [],
    });
    expect(september.rateFor('organic_search')).toBe(1800);

    // The August line still charges what it charged.
    const gross = Money.fromMajorString('620');
    expect(CommissionPolicy.charge(gross, snapshot).toMajorString()).toBe('93.00');
    expect(snapshot.ruleSetVersion).toBe(1);
  });
});

describe('commission — the payout statement reconciles', () => {
  it('reproduces design-reference/seller.html exactly', () => {
    const p = new CommissionPolicy();
    const lines = [
      { gross: '1520', source: 'storefront_referral' },
      { gross: '620', source: 'organic_search' },
      { gross: '900', source: 'storefront_referral' },
      { gross: '1240', source: 'storefront_referral' },
    ] as const;

    const gross = lines.map((l) => Money.fromMajorString(l.gross));
    const fees = lines.map((l) =>
      CommissionPolicy.charge(Money.fromMajorString(l.gross), p.snapshot(l.source)),
    );

    expect(sumMoney(gross).toMajorString()).toBe('4280.00');
    expect(sumMoney(fees).toMajorString()).toBe('276.00');

    const net = sumMoney(gross).minus(sumMoney(fees)).minus(Money.fromMajorString('225'));
    expect(net.toMajorString()).toBe('3779.00');

    // "your effective rate is 6.4% because 3 of 4 orders were your own"
    expect(CommissionPolicy.effectiveRateBps(sumMoney(gross), sumMoney(fees))).toBe(645);
  });
});

describe('attribution — priority and windows', () => {
  const resolve = (touches: Touch[], opts: Partial<{ prior: boolean; sellerId: string }> = {}) =>
    new AttributionResolver(clock()).resolve({
      touches,
      orderedAt: ORDERED_AT,
      sellerId: opts.sellerId ?? 'dar-al-ward',
      hasPriorPurchaseFromSeller: opts.prior ?? false,
    });

  it('a storefront link earns the house the low rate', () => {
    const d = resolve([
      { channel: 'storefront_referral', at: daysBefore(2), ref: 'dar-al-ward', sellerId: 'dar-al-ward' },
    ]);
    expect(d.source).toBe('storefront_referral');
    expect(new CommissionPolicy().rateFor(d.source)).toBe(500);
  });

  it('a paid campaign outranks a storefront touch', () => {
    const d = resolve([
      { channel: 'storefront_referral', at: daysBefore(5), ref: 'dar-al-ward', sellerId: 'dar-al-ward' },
      { channel: 'paid_campaign', at: daysBefore(1), ref: 'ramadan-26' },
    ]);
    expect(d.source).toBe('paid_campaign');
  });

  it('a creator code outranks everything', () => {
    const d = resolve([
      { channel: 'paid_campaign', at: daysBefore(1), ref: 'ramadan-26' },
      { channel: 'creator_affiliate', at: daysBefore(3), ref: 'nour99' },
    ]);
    expect(d.source).toBe('creator_affiliate');
    expect(d.ref).toBe('nour99');
  });

  it('an expired campaign touch does not count', () => {
    const d = resolve([{ channel: 'paid_campaign', at: daysBefore(30), ref: 'old' }]);
    expect(d.source).toBe('unknown');
  });

  it('a storefront touch still counts at 29 days and lapses at 31', () => {
    const inside = resolve([
      { channel: 'storefront_referral', at: daysBefore(29), sellerId: 'dar-al-ward' },
    ]);
    expect(inside.source).toBe('storefront_referral');

    const outside = resolve([
      { channel: 'storefront_referral', at: daysBefore(31), sellerId: 'dar-al-ward' },
    ]);
    expect(outside.source).toBe('unknown');
  });

  it("another house's storefront link does not earn THIS house the low rate", () => {
    const d = resolve(
      [{ channel: 'storefront_referral', at: daysBefore(1), ref: 'maison-nour', sellerId: 'maison-nour' }],
      { sellerId: 'dar-al-ward' },
    );
    expect(d.source).not.toBe('storefront_referral');
  });

  it('a returning customer entering directly is direct_repeat, not organic', () => {
    const d = resolve([{ channel: 'direct', at: daysBefore(0) }], { prior: true });
    expect(d.source).toBe('direct_repeat');
    expect(new CommissionPolicy().rateFor(d.source)).toBe(500);
  });

  it('a first-time direct visitor is not direct_repeat', () => {
    const d = resolve([{ channel: 'direct', at: daysBefore(0) }], { prior: false });
    expect(d.source).toBe('unknown');
  });

  it('marketplace discovery is organic_search at the high rate', () => {
    const d = resolve([{ channel: 'organic_search', at: daysBefore(0) }]);
    expect(d.source).toBe('organic_search');
    expect(new CommissionPolicy().rateFor(d.source)).toBe(1500);
  });

  it('an empty trail falls to unknown, and unknown is cheap', () => {
    const d = resolve([]);
    expect(d.source).toBe('unknown');
    expect(new CommissionPolicy().rateFor(d.source)).toBe(500);
  });
});

describe('attribution — the decision is defensible', () => {
  it('records the window policy and touch count with the verdict', () => {
    const d = new AttributionResolver(clock()).resolve({
      touches: [{ channel: 'storefront_referral', at: daysBefore(3), sellerId: 'dar-al-ward' }],
      orderedAt: ORDERED_AT,
      sellerId: 'dar-al-ward',
      hasPriorPurchaseFromSeller: false,
    });
    expect(d.windows.storefrontDays).toBe(30);
    expect(d.consideredTouches).toBe(1);
    expect(d.reason).toContain('30d');
    expect(d.decidedAt.toISOString()).toBe('2026-09-01T18:00:05.000Z');
  });

  it('is deterministic — the same trail always yields the same verdict', () => {
    const touches: Touch[] = [
      { channel: 'organic_search', at: daysBefore(4) },
      { channel: 'storefront_referral', at: daysBefore(2), sellerId: 'dar-al-ward' },
      { channel: 'direct', at: daysBefore(0) },
    ];
    const ctx = {
      touches,
      orderedAt: ORDERED_AT,
      sellerId: 'dar-al-ward',
      hasPriorPurchaseFromSeller: true,
    };
    const runs = Array.from({ length: 25 }, () => new AttributionResolver(clock()).resolve(ctx).source);
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe('storefront_referral');
  });
});
