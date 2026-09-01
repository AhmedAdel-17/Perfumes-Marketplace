/**
 * Commission.
 *
 * Pattern — Strategy resolved through a Registry (ENGINEERING_PRINCIPLES §4).
 *
 * The asymmetric take rate is the heart of the business (doc 03 §2): the platform
 * earns more when it creates incremental demand, and should not tax seller-owned
 * demand as if it created it. Rates therefore differ by order source AND by
 * seller, are administrator-configurable, and change over time.
 *
 * Two rules keep historical statements reproducible:
 *
 *  1. Rates are data, never constants. Nothing here is hardcoded into a caller.
 *  2. The resolved rate is SNAPSHOTTED onto the order line at purchase time.
 *     A statement issued in August must still reconcile after the rates change
 *     in September.
 */
import type { BasisPoints, Money } from '../value-objects/money.js';

export const ORDER_SOURCES = [
  'storefront_referral',
  'direct_repeat',
  'organic_search',
  'paid_campaign',
  'creator_affiliate',
  'email_crm',
  'unknown',
] as const;

export type OrderSource = (typeof ORDER_SOURCES)[number];

/**
 * Working defaults, pending D-4 in OPEN_DECISIONS.md.
 *
 * `unknown` deliberately takes the LOW rate: when attribution is ambiguous the
 * doubt goes to the seller. Charging the marketplace rate on orders we cannot
 * prove we created is how a platform loses the houses it depends on.
 */
export const DEFAULT_RATES: Readonly<Record<OrderSource, BasisPoints>> = Object.freeze({
  storefront_referral: 500,
  direct_repeat: 500,
  organic_search: 1500,
  paid_campaign: 1800,
  creator_affiliate: 1500,
  email_crm: 1200,
  unknown: 500,
});

/** A per-seller override, e.g. a negotiated rate for a launch partner. */
export interface SellerRateOverride {
  readonly sellerId: string;
  readonly source: OrderSource;
  readonly bps: BasisPoints;
}

export interface CommissionRuleSet {
  readonly version: number;
  readonly effectiveFrom: Date;
  readonly defaults: Readonly<Record<OrderSource, BasisPoints>>;
  readonly overrides: readonly SellerRateOverride[];
}

export const DEFAULT_RULE_SET: CommissionRuleSet = Object.freeze({
  version: 1,
  effectiveFrom: new Date('2026-07-01T00:00:00Z'),
  defaults: DEFAULT_RATES,
  overrides: [],
});

/**
 * The value snapshotted onto an order line at purchase.
 *
 * It carries the rule-set version so a dispute can be answered with "this is the
 * rate that was in force, and here is the version it came from".
 */
export interface CommissionSnapshot {
  readonly source: OrderSource;
  readonly bps: BasisPoints;
  readonly ruleSetVersion: number;
}

export class CommissionPolicy {
  constructor(private readonly rules: CommissionRuleSet = DEFAULT_RULE_SET) {}

  /** Resolve the rate for a seller and source. Seller override wins over default. */
  rateFor(source: OrderSource, sellerId?: string): BasisPoints {
    if (sellerId) {
      const override = this.rules.overrides.find(
        (o) => o.sellerId === sellerId && o.source === source,
      );
      if (override) return override.bps;
    }
    return this.rules.defaults[source];
  }

  /** Produce the snapshot to store on the order line. */
  snapshot(source: OrderSource, sellerId?: string): CommissionSnapshot {
    return {
      source,
      bps: this.rateFor(source, sellerId),
      ruleSetVersion: this.rules.version,
    };
  }

  /**
   * Charge a line using its SNAPSHOT, never the current rules.
   *
   * Taking the snapshot as an argument — rather than re-resolving from today's
   * rule set — is what makes an old statement reproducible.
   */
  static charge(gross: Money, snapshot: CommissionSnapshot): Money {
    return gross.applyRate(snapshot.bps);
  }

  /**
   * Effective take rate across a set of lines.
   *
   * Doc 03 §4 defines this as total platform transaction revenue over GMV. It is
   * the number a house actually feels, and the one that makes the asymmetric
   * model legible: "your effective rate is 6.4% because most orders were yours".
   */
  static effectiveRateBps(gross: Money, fees: Money): BasisPoints {
    if (gross.isZero()) return 0;
    return Math.round((fees.minor / gross.minor) * 10_000);
  }
}
