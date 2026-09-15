/**
 * Place order.
 *
 * Pattern — Builder (ENGINEERING_PRINCIPLES §4).
 *
 * One cart becomes one order and N sub-orders, each with its own SLA clocks,
 * its own shipping line and its own commission snapshot. Multi-seller is a real
 * requirement, not an edge case (CLAUDE.md §7).
 *
 * The subtle part, and the reason attribution is resolved PER SUB-ORDER rather
 * than once for the whole cart: a storefront referral only earns the low rate
 * for the house that owns the link. If a customer arrives through Dar Al Ward's
 * bio link and also buys from Maison Nour in the same basket, Dar Al Ward pays
 * 5% and Maison Nour pays the marketplace rate — because the platform, not
 * Maison Nour, put that order in the basket.
 *
 * Invariants are checked at build(), so a malformed order cannot exist even
 * transiently. They mirror the database CHECK constraints in 0001 exactly.
 */
import { Money, sumMoney } from '../value-objects/money';
import type { Address } from '../value-objects/address';
import { CommissionPolicy, type CommissionSnapshot, type OrderSource } from '../policies/commission';
import { AttributionResolver, type AttributionDecision, type Touch } from '../policies/attribution';
import { InvalidMoney } from '../errors/index';
import type { Clock } from '../ports/clock';

export type PaymentMethod = 'cod' | 'card' | 'wallet';

export interface CartLine {
  readonly productId: string;
  readonly sellerId: string;
  /** Snapshotted so a later catalogue edit cannot rewrite an old order. */
  readonly productName: string;
  readonly brandName: string;
  readonly sku: string;
  readonly volumeMl: number;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface ShippingQuote {
  readonly sellerId: string;
  readonly amount: Money;
  readonly etaDaysMin: number;
  readonly etaDaysMax: number;
}

export interface SellerTerms {
  readonly sellerId: string;
  readonly confirmationSlaHours: number;
  readonly dispatchSlaHours: number;
}

export interface PlaceOrderInput {
  readonly reference: string;
  readonly customerId: string;
  readonly contactPhone: string;
  readonly contactName: string;
  /** Required. The database demands it; the domain must not build an order without one. */
  readonly address: Address;
  readonly lines: readonly CartLine[];
  readonly shipping: readonly ShippingQuote[];
  readonly terms: readonly SellerTerms[];
  readonly paymentMethod: PaymentMethod;
  readonly touches: readonly Touch[];
  /** Houses this customer has bought from before — drives `direct_repeat`. */
  readonly priorPurchaseSellerIds: ReadonlySet<string>;
  readonly orderedAt: Date;
  readonly discount?: Money;
}

export interface DraftLineItem {
  readonly productId: string;
  readonly productName: string;
  readonly brandName: string;
  readonly sku: string;
  readonly volumeMl: number;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly line: Money;
  readonly commission: CommissionSnapshot;
  readonly commissionAmount: Money;
}

export interface DraftSubOrder {
  readonly reference: string;
  readonly sellerId: string;
  readonly lineItems: readonly DraftLineItem[];
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly commission: Money;
  readonly attribution: AttributionDecision;
  readonly confirmDueAt: Date;
  /**
   * The house's dispatch window, SNAPSHOTTED — not a deadline.
   *
   * The deadline cannot exist yet: it starts at confirmation. What is fixed at
   * placement is how long the house promised to take, for the same reason the
   * commission rate is fixed here.
   */
  readonly dispatchSlaHours: number;
  readonly etaDaysMin: number;
  readonly etaDaysMax: number;
}

export interface DraftOrder {
  readonly reference: string;
  readonly customerId: string;
  readonly contactPhone: string;
  readonly contactName: string;
  readonly address: Address;
  readonly paymentMethod: PaymentMethod;
  readonly subOrders: readonly DraftSubOrder[];
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly discount: Money;
  readonly total: Money;
  /**
   * The order-level source, required and NOT NULL in the schema.
   *
   * With several houses in one basket there can be several verdicts; the order
   * carries the one belonging to the largest sub-order, while each sub-order
   * keeps its own for billing. Reporting stays honest because commission is
   * always charged from the sub-order, never from this field.
   */
  readonly source: OrderSource;
  readonly placedAt: Date;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class PlaceOrder {
  constructor(
    private readonly clock: Clock,
    private readonly commission: CommissionPolicy = new CommissionPolicy(),
    private readonly attribution: AttributionResolver = new AttributionResolver(clock),
  ) {}

  build(input: PlaceOrderInput): DraftOrder {
    if (input.lines.length === 0) {
      throw new InvalidMoney('An order must contain at least one line');
    }

    const sellerIds = [...new Set(input.lines.map((l) => l.sellerId))];

    const subOrders: DraftSubOrder[] = sellerIds.map((sellerId, index) => {
      const lines = input.lines.filter((l) => l.sellerId === sellerId);

      const quote = input.shipping.find((s) => s.sellerId === sellerId);
      if (!quote) {
        // Doc 06 §6 requires shipping to be visible BEFORE payment. A missing
        // quote means we would be guessing, and guessing is a hidden cost.
        throw new InvalidMoney(`No shipping quote for seller ${sellerId}`);
      }

      const terms = input.terms.find((t) => t.sellerId === sellerId);
      if (!terms) {
        throw new InvalidMoney(`No operating terms for seller ${sellerId}`);
      }

      // Resolved per house — see the note at the top of this file.
      const decision = this.attribution.resolve({
        touches: input.touches,
        orderedAt: input.orderedAt,
        sellerId,
        hasPriorPurchaseFromSeller: input.priorPurchaseSellerIds.has(sellerId),
      });

      const snapshot = this.commission.snapshot(decision.source, sellerId);

      const lineItems: DraftLineItem[] = lines.map((l) => {
        if (!Number.isInteger(l.quantity) || l.quantity < 1) {
          throw new InvalidMoney(`Quantity must be a positive integer, received ${l.quantity}`);
        }
        const line = l.unitPrice.times(l.quantity);
        return {
          productId: l.productId,
          productName: l.productName,
          brandName: l.brandName,
          sku: l.sku,
          volumeMl: l.volumeMl,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          line,
          commission: snapshot,
          commissionAmount: CommissionPolicy.charge(line, snapshot),
        };
      });

      const merchandise = sumMoney(lineItems.map((i) => i.line));

      return {
        reference: `${input.reference}-${ALPHABET[index] ?? String(index)}`,
        sellerId,
        lineItems,
        merchandise,
        shipping: quote.amount,
        commission: sumMoney(lineItems.map((i) => i.commissionAmount)),
        attribution: decision,
        confirmDueAt: new Date(
          input.orderedAt.getTime() + terms.confirmationSlaHours * 3_600_000,
        ),
        // Received here and discarded until 0020, which is why no dispatch
        // deadline was ever written anywhere.
        dispatchSlaHours: terms.dispatchSlaHours,
        etaDaysMin: quote.etaDaysMin,
        etaDaysMax: quote.etaDaysMax,
      };
    });

    const merchandise = sumMoney(subOrders.map((s) => s.merchandise));
    const shipping = sumMoney(subOrders.map((s) => s.shipping));
    const discount = input.discount ?? Money.zero();
    const total = merchandise.plus(shipping).minus(discount);

    if (total.isNegative()) {
      throw new InvalidMoney('Order total cannot be negative');
    }

    // Mirrors the orders_total_reconciles CHECK constraint in 0001.
    const recomputed = merchandise.plus(shipping).minus(discount);
    if (!recomputed.equals(total)) {
      throw new InvalidMoney('Order total does not reconcile');
    }

    const largest = [...subOrders].sort(
      (a, b) => b.merchandise.minor - a.merchandise.minor,
    )[0]!;

    return {
      reference: input.reference,
      customerId: input.customerId,
      contactPhone: input.contactPhone,
      contactName: input.contactName,
      address: input.address,
      paymentMethod: input.paymentMethod,
      subOrders,
      merchandise,
      shipping,
      discount,
      total,
      source: largest.attribution.source,
      placedAt: input.orderedAt,
    };
  }

  /**
   * Shipping is never merged and never subsidised (doc 03 §10, doc 06 §6).
   * Exposed so checkout can show the split before payment.
   */
  static shipmentCount(order: DraftOrder): number {
    return order.subOrders.length;
  }
}
