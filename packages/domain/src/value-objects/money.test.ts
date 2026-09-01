import { describe, expect, it } from 'vitest';
import { Money, sumMoney } from './money.js';
import { CurrencyMismatch, InvalidMoney } from '../errors/index.js';

describe('Money — construction', () => {
  it('rejects a float, because floating-point money is forbidden', () => {
    expect(() => Money.fromMinor(19.5)).toThrow(InvalidMoney);
  });

  it('parses a decimal string exactly', () => {
    expect(Money.fromMajorString('450').minor).toBe(45_000);
    expect(Money.fromMajorString('450.50').minor).toBe(45_050);
    expect(Money.fromMajorString('450.5').minor).toBe(45_050);
    expect(Money.fromMajorString('0.07').minor).toBe(7);
    expect(Money.fromMajorString('-12.34').minor).toBe(-1_234);
  });

  it('refuses more than two decimal places rather than silently rounding', () => {
    expect(() => Money.fromMajorString('450.505')).toThrow(InvalidMoney);
    expect(() => Money.fromMajorString('four fifty')).toThrow(InvalidMoney);
  });

  it('round-trips through its string form', () => {
    for (const v of ['0.00', '1.05', '450.00', '2325.99']) {
      expect(Money.fromMajorString(v).toMajorString()).toBe(v);
    }
  });

  it('is immutable', () => {
    const m = Money.fromMajorString('100');
    expect(() => {
      (m as unknown as { minor: number }).minor = 1;
    }).toThrow();
    expect(m.minor).toBe(10_000);
  });
});

describe('Money — arithmetic', () => {
  it('adds and subtracts without drift over many operations', () => {
    // 0.1 + 0.2 !== 0.3 in floating point. Here it must be exact.
    const tenth = Money.fromMajorString('0.10');
    let acc = Money.zero();
    for (let i = 0; i < 1000; i++) acc = acc.plus(tenth);
    expect(acc.toMajorString()).toBe('100.00');
  });

  it('refuses to combine different currencies', () => {
    const egp = Money.fromMinor(100, 'EGP');
    const other = Money.fromMinor(100, 'USD' as 'EGP');
    expect(() => egp.plus(other)).toThrow(CurrencyMismatch);
  });

  it('multiplies only by whole quantities', () => {
    expect(Money.fromMajorString('450').times(2).toMajorString()).toBe('900.00');
    expect(() => Money.fromMajorString('450').times(1.5)).toThrow(InvalidMoney);
  });

  it('sums a list', () => {
    const items = ['1520', '620', '900', '1240'].map((v) => Money.fromMajorString(v));
    expect(sumMoney(items).toMajorString()).toBe('4280.00');
  });
});

describe('Money — commission rates in basis points', () => {
  it('reproduces every rate in the payout statement design', () => {
    // design-reference/seller.html — these must reconcile exactly
    const cases: Array<[string, number, string]> = [
      ['1520', 500, '76.00'],
      ['620', 1500, '93.00'],
      ['900', 500, '45.00'],
      ['1240', 500, '62.00'],
      ['440', 1500, '66.00'],
      ['380', 500, '19.00'],
    ];
    for (const [gross, bps, fee] of cases) {
      expect(Money.fromMajorString(gross).applyRate(bps).toMajorString()).toBe(fee);
    }
  });

  it('the statement totals close', () => {
    const gross = ['1520', '620', '900', '1240'].map((v) => Money.fromMajorString(v));
    const rates = [500, 1500, 500, 500];
    const fees = gross.map((g, i) => g.applyRate(rates[i]!));

    expect(sumMoney(gross).toMajorString()).toBe('4280.00');
    expect(sumMoney(fees).toMajorString()).toBe('276.00');

    const shipping = Money.fromMajorString('225');
    const net = sumMoney(gross).minus(sumMoney(fees)).minus(shipping);
    expect(net.toMajorString()).toBe('3779.00');
  });

  it('rounds half away from zero so a seller can check it by hand', () => {
    // 10.05 EGP at 5% = 0.5025 piastres-worth → rounds up to 1 piastre
    expect(Money.fromMinor(1005).applyRate(500).minor).toBe(50);
    // exact halves round up, not to even
    expect(Money.fromMinor(10).applyRate(500).minor).toBe(1); // 0.5 → 1
    expect(Money.fromMinor(30).applyRate(500).minor).toBe(2); // 1.5 → 2
  });

  it('rejects fractional or negative rates', () => {
    expect(() => Money.fromMajorString('100').applyRate(5.5)).toThrow(InvalidMoney);
    expect(() => Money.fromMajorString('100').applyRate(-500)).toThrow(InvalidMoney);
  });

  it('a zero rate yields nothing, not a rounding artefact', () => {
    expect(Money.fromMajorString('999.99').applyRate(0).isZero()).toBe(true);
  });
});

describe('Money — allocate', () => {
  it('never loses or invents a piastre', () => {
    const shipping = Money.fromMajorString('135');
    const parts = shipping.allocate([45, 50, 40]);
    expect(sumMoney(parts).equals(shipping)).toBe(true);
  });

  it('distributes an indivisible remainder deterministically', () => {
    // 10 piastres across three equal weights: 4 / 3 / 3
    const parts = Money.fromMinor(10).allocate([1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([4, 3, 3]);
    expect(sumMoney(parts).minor).toBe(10);
  });

  it('gives remainder piastres to the largest weight first', () => {
    const parts = Money.fromMinor(100).allocate([1, 5, 1]);
    expect(sumMoney(parts).minor).toBe(100);
    expect(parts[1]!.minor).toBeGreaterThan(parts[0]!.minor);
  });

  it('holds for awkward splits', () => {
    for (const total of [1, 7, 33, 101, 9999]) {
      for (const weights of [[1, 1], [1, 2, 3], [7, 11, 13, 17]]) {
        const parts = Money.fromMinor(total).allocate(weights);
        expect(sumMoney(parts).minor).toBe(total);
      }
    }
  });

  it('rejects degenerate weights', () => {
    expect(() => Money.fromMinor(100).allocate([])).toThrow(InvalidMoney);
    expect(() => Money.fromMinor(100).allocate([0, 0])).toThrow(InvalidMoney);
    expect(() => Money.fromMinor(100).allocate([1, -1])).toThrow(InvalidMoney);
  });
});
