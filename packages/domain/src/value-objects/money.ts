/**
 * Money.
 *
 * Pattern — Value Object (ENGINEERING_PRINCIPLES §4).
 *
 * Immutable, carries its currency, and holds an integer number of *piastres*
 * (1 EGP = 100 piastres). There is no public constructor that accepts a float,
 * because floating-point money is the single most common class of financial bug
 * and it is forbidden here.
 *
 * Rate application uses basis points (500 = 5%, 1500 = 15%) so a commission rate
 * never enters the system as 0.05 and never accumulates binary error.
 */
import { CurrencyMismatch, InvalidMoney } from '../errors/index.js';

export type Currency = 'EGP';

/** Basis points. 100 bps = 1%. 500 = 5%, 1500 = 15%, 1800 = 18%. */
export type BasisPoints = number;

const MINOR_UNITS_PER_MAJOR = 100;

export class Money {
  private constructor(
    readonly minor: number,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  // ---------------------------------------------------------------- creation

  /** From an integer number of piastres. The canonical constructor. */
  static fromMinor(minor: number, currency: Currency = 'EGP'): Money {
    if (!Number.isInteger(minor)) {
      throw new InvalidMoney(`Money.fromMinor requires an integer, received ${minor}`);
    }
    if (!Number.isSafeInteger(minor)) {
      throw new InvalidMoney(`Money value outside safe integer range: ${minor}`);
    }
    return new Money(minor, currency);
  }

  /**
   * From a decimal *string* such as "450" or "450.50".
   *
   * Deliberately a string, not a number: accepting a float here would reintroduce
   * exactly the imprecision the class exists to prevent.
   */
  static fromMajorString(value: string, currency: Currency = 'EGP'): Money {
    const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) {
      throw new InvalidMoney(
        `Money.fromMajorString expects a decimal string with at most 2 places, received "${value}"`,
      );
    }
    const [, sign, whole, fraction = ''] = match;
    const piastres = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));
    return Money.fromMinor(sign ? -piastres : piastres, currency);
  }

  static zero(currency: Currency = 'EGP'): Money {
    return new Money(0, currency);
  }

  // -------------------------------------------------------------- arithmetic

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor + other.minor, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor - other.minor, this.currency);
  }

  /** Multiply by a whole quantity — line item price × units. */
  times(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new InvalidMoney(`Money.times requires an integer quantity, received ${quantity}`);
    }
    return Money.fromMinor(this.minor * quantity, this.currency);
  }

  negated(): Money {
    return Money.fromMinor(-this.minor, this.currency);
  }

  /**
   * Apply a rate expressed in basis points, rounding half away from zero.
   *
   * Half-away-from-zero (rather than banker's rounding) is chosen because seller
   * statements must be reproducible by hand: a house checking 380.00 × 5% should
   * arrive at the same 19.00 we did, with the arithmetic they already know.
   */
  applyRate(bps: BasisPoints): Money {
    if (!Number.isInteger(bps)) {
      throw new InvalidMoney(`Rate must be integer basis points, received ${bps}`);
    }
    if (bps < 0) {
      throw new InvalidMoney(`Rate cannot be negative, received ${bps}`);
    }
    const scaled = this.minor * bps;
    const sign = scaled < 0 ? -1 : 1;
    const rounded = Math.floor(Math.abs(scaled) / 10_000 + 0.5) * sign;
    return Money.fromMinor(rounded, this.currency);
  }

  /**
   * Split across weights with no piastre lost.
   *
   * Used for shipping apportionment and discount distribution across sub-orders.
   * Remainder piastres are handed out one at a time from the largest weight down,
   * so the parts always sum exactly back to the whole.
   */
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new InvalidMoney('Money.allocate requires at least one weight');
    }
    if (weights.some((w) => w < 0)) {
      throw new InvalidMoney('Money.allocate weights must be non-negative');
    }
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) {
      throw new InvalidMoney('Money.allocate weights must not sum to zero');
    }

    const shares = weights.map((w) => Math.floor((this.minor * w) / total));
    let remainder = this.minor - shares.reduce((a, b) => a + b, 0);

    const order = weights
      .map((weight, index) => ({ weight, index }))
      .sort((a, b) => b.weight - a.weight || a.index - b.index);

    for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) {
      const target = order[i]!.index;
      shares[target] = shares[target]! + 1;
    }

    return shares.map((s) => Money.fromMinor(s, this.currency));
  }

  // -------------------------------------------------------------- comparison

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor > other.minor;
  }

  // ------------------------------------------------------------- conversions

  /**
   * Decimal string, e.g. "450.00". For persistence and debugging only.
   *
   * Presentation — numeral system, tabular figures, the letterspaced currency
   * label — is a delivery concern and lives outside the domain.
   */
  toMajorString(): string {
    const sign = this.minor < 0 ? '-' : '';
    const abs = Math.abs(this.minor);
    const whole = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
    const fraction = abs % MINOR_UNITS_PER_MAJOR;
    return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
  }

  toString(): string {
    return `${this.toMajorString()} ${this.currency}`;
  }

  toJSON(): { minor: number; currency: Currency } {
    return { minor: this.minor, currency: this.currency };
  }

  // ------------------------------------------------------------------ helper

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatch(this.currency, other.currency);
    }
  }
}

/** Sum a list. Empty list yields zero rather than throwing — callers total naturally. */
export function sumMoney(items: readonly Money[], currency: Currency = 'EGP'): Money {
  return items.reduce((acc, m) => acc.plus(m), Money.zero(currency));
}
