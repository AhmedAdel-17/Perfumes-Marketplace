/**
 * In-memory repositories.
 *
 * Not a toy: this is the reference implementation the contract is written
 * against, and it is what lets a use-case test run in microseconds with no
 * database. If a rule holds here and in Drizzle, the rule is in the contract
 * rather than in one adapter's accident.
 *
 * Framework-free, like everything else in this package.
 */
import { Money } from '../value-objects/money';
import { SubOrderLifecycle, type Actor, type ReasonCode, type SubOrderState, type TransitionRecord } from '../state-machines/sub-order';
import { InvalidTransition } from '../errors/index';
import type { DraftOrder } from '../services/place-order';
import type { SettlementSubOrder } from '../services/settlement';
import type {
  CustomerRecord, CustomerRepository,
  OrderRepository, PersistedOrder, ProductRecord, ProductRepository, Repositories,
  SellerRecord, SellerRepository, SubOrderRecord, SubOrderRepository, UnitOfWork,
} from '../ports/repositories';

interface OrderRow {
  id: string;
  customerId: string;
  contactPhone: string;
  contactName: string;
  placedAt: Date;
  paymentMethod: string;
  reference: string;
  source: PersistedOrder['source'];
  totalMinor: number;
  subOrderIds: string[];
}

interface SubOrderLineRow {
  name: string;
  brandName: string;
  quantity: number;
  unitPriceMinor: number;
}

interface SubOrderRow {
  id: string;
  reference: string;
  lines: SubOrderLineRow[];
  orderId: string;
  sellerId: string;
  state: SubOrderState;
  merchandiseMinor: number;
  shippingMinor: number;
  commissionSource: SettlementSubOrder['commissionSource'];
  commissionBps: number;
  deliveredAt?: Date;
  /** Courier has remitted the cash. NOT implied by delivery. */
  codRemitted: boolean;
}

interface Store {
  sellers: Map<string, SellerRecord>;
  customers: Map<string, CustomerRecord>;
  products: Map<string, ProductRecord>;
  orders: Map<string, OrderRow>;
  subOrders: Map<string, SubOrderRow>;
  transitions: TransitionRecord[];
  seq: number;
}

const emptyStore = (): Store => ({
  sellers: new Map(), customers: new Map(), products: new Map(), orders: new Map(),
  subOrders: new Map(), transitions: [], seq: 0,
});

const cloneStore = (s: Store): Store => ({
  sellers: new Map(s.sellers),
  customers: new Map(s.customers),
  products: new Map(s.products),
  orders: new Map([...s.orders].map(([k, v]) => [k, { ...v, subOrderIds: [...v.subOrderIds] }])),
  subOrders: new Map([...s.subOrders].map(([k, v]) => [k, { ...v }])),
  transitions: [...s.transitions],
  seq: s.seq,
});

export class InMemoryUnitOfWork implements UnitOfWork {
  private store: Store = emptyStore();

  /* ------------------------------------------------------------ seeding */

  addSeller(record: SellerRecord): void {
    this.store.sellers.set(record.id, record);
  }

  addProduct(record: ProductRecord): void {
    this.store.products.set(record.id, record);
  }

  /** Courier remittance. Delivery alone does not put cash in our hands. */
  markRemitted(subOrderId: string): void {
    const row = this.store.subOrders.get(subOrderId);
    if (!row) throw new Error(`Unknown sub-order ${subOrderId}`);
    row.codRemitted = true;
  }

  /* -------------------------------------------------------- unit of work */

  /**
   * Snapshot, run, and discard the snapshot only on success.
   *
   * The contract requires a failed save to leave nothing behind. In Postgres
   * that is a transaction; here it is a copy-on-write of the whole store, which
   * gives the same observable guarantee.
   */
  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    const snapshot = cloneStore(this.store);
    try {
      return await work(this.repositories());
    } catch (error) {
      this.store = snapshot;
      throw error;
    }
  }

  private repositories(): Repositories {
    const store = () => this.store;

    const sellers: SellerRepository = {
      async findById(id) {
        return store().sellers.get(id) ?? null;
      },
      async findBySlug(slug) {
        return [...store().sellers.values()].find((s) => s.slug === slug) ?? null;
      },
    };

    const customers: CustomerRepository = {
      async findOrCreateByPhone({ phone, fullName }) {
        const s = store();
        const existing = [...s.customers.values()].find((c) => c.phone === phone);
        if (existing) {
          const updated = { ...existing, fullName };
          s.customers.set(existing.id, updated);
          return updated;
        }
        const record: CustomerRecord = {
          id: `customer-${++s.seq}`, phone, fullName, authUserId: null,
        };
        s.customers.set(record.id, record);
        return record;
      },

      async listPriorPurchaseSellerIds(customerId) {
        const s = store();
        const orderIds = new Set(
          [...s.orders.values()].filter((o) => o.customerId === customerId).map((o) => o.id),
        );
        return new Set(
          [...s.subOrders.values()]
            .filter((so) => orderIds.has(so.orderId))
            .map((so) => so.sellerId),
        );
      },
    };

    const products: ProductRepository = {
      async findBySlug(slug) {
        return [...store().products.values()].find((p) => p.slug === slug) ?? null;
      },
      async listPublishedBySeller(sellerId) {
        return [...store().products.values()].filter(
          (p) => p.sellerId === sellerId && p.status === 'published',
        );
      },

      async snapshotForCart(productIds) {
        const s = store();
        const wanted = new Set(productIds);
        return [...s.products.values()]
          .filter((p) => wanted.has(p.id))
          .map((p) => {
            // The house is looked up rather than assumed live, because that is
            // exactly the case the Drizzle adapter joins for. An in-memory
            // stand-in that always answers `true` here would let the contract
            // test pass while the real query was wrong.
            const seller = s.sellers.get(p.sellerId);
            return {
              productId: p.id,
              sellerId: p.sellerId,
              slug: p.slug,
              name: p.name,
              brandName: seller?.tradingName ?? '',
              brandLatin: (seller?.tradingName ?? '').toUpperCase(),
              sku: p.sku,
              volumeMl: p.volumeMl,
              scentFamily: 'amber',
              unitPrice: p.price,
              stock: p.stock,
              isPublished: p.status === 'published',
              isHouseLive: seller?.status === 'live',
              fulfilmentHours: 48,
            };
          });
      },
    };

    const orders: OrderRepository = {
      async save(draft: DraftOrder, sellerIdBySlug) {
        const s = store();
        const orderId = `order-${++s.seq}`;
        const subOrderIds: string[] = [];

        for (const sub of draft.subOrders) {
          const sellerId = sellerIdBySlug.get(sub.sellerId);
          if (!sellerId || !s.sellers.has(sellerId)) {
            throw new Error(`Unknown seller for sub-order ${sub.reference}`);
          }
          for (const li of sub.lineItems) {
            // Mirrors the foreign key the database would enforce.
            if (!s.products.has(li.productId)) {
              throw new Error(`Unknown product ${li.productId}`);
            }
          }

          const subId = `sub-${++s.seq}`;
          subOrderIds.push(subId);
          s.subOrders.set(subId, {
            id: subId,
            reference: sub.reference,
            lines: sub.lineItems.map((li) => ({
              name: li.productName,
              brandName: li.brandName,
              quantity: li.quantity,
              unitPriceMinor: li.unitPrice.minor,
            })),
            orderId,
            sellerId,
            state: 'placed',
            merchandiseMinor: sub.merchandise.minor,
            shippingMinor: sub.shipping.minor,
            commissionSource: sub.lineItems[0]!.commission.source,
            commissionBps: sub.lineItems[0]!.commission.bps,
            codRemitted: false,
          });
        }

        s.orders.set(orderId, {
          id: orderId,
          customerId: draft.customerId,
          contactPhone: draft.contactPhone,
          contactName: draft.contactName,
          placedAt: draft.placedAt,
          paymentMethod: draft.paymentMethod,
          reference: draft.reference,
          source: draft.source,
          totalMinor: draft.total.minor,
          subOrderIds,
        });

        return {
          id: orderId,
          reference: draft.reference,
          source: draft.source,
          total: draft.total,
          subOrderIds,
        };
      },

      async findForCustomerLookup({ reference, phone }) {
        const s = store();
        // Both factors, together. Never a match followed by a comparison —
        // see the port for why that distinction is the whole point.
        const row = [...s.orders.values()].find(
          (o) => o.reference === reference && o.contactPhone === phone,
        );
        if (!row) return null;

        return {
          reference: row.reference,
          contactName: row.contactName,
          placedAt: row.placedAt,
          paymentMethod: row.paymentMethod,
          total: Money.fromMinor(row.totalMinor),
          houses: row.subOrderIds.map((id) => {
            const sub = s.subOrders.get(id)!;
            const seller = s.sellers.get(sub.sellerId);
            return {
              subOrderId: sub.id,
              reference: sub.reference,
              sellerId: sub.sellerId,
              brandName: seller?.tradingName ?? '',
              state: sub.state,
              merchandise: Money.fromMinor(sub.merchandiseMinor),
              shipping: Money.fromMinor(sub.shippingMinor),
              items: sub.lines.map((l) => ({
                name: l.name,
                brandName: l.brandName,
                quantity: l.quantity,
                unitPrice: Money.fromMinor(l.unitPriceMinor),
              })),
            };
          }),
        };
      },

      async findByReference(reference) {
        const row = [...store().orders.values()].find((o) => o.reference === reference);
        if (!row) return null;
        return {
          id: row.id,
          reference: row.reference,
          source: row.source,
          total: Money.fromMinor(row.totalMinor),
          subOrderIds: row.subOrderIds,
        };
      },
    };

    const toRecord = (r: SubOrderRow): SubOrderRecord => ({
      id: r.id,
      reference: r.reference,
      sellerId: r.sellerId,
      orderId: r.orderId,
      state: r.state,
      merchandise: Money.fromMinor(r.merchandiseMinor),
      shipping: Money.fromMinor(r.shippingMinor),
    });

    const subOrders: SubOrderRepository = {
      async findById(id) {
        const row = store().subOrders.get(id);
        return row ? toRecord(row) : null;
      },

      async listBySeller(sellerId) {
        return [...store().subOrders.values()]
          .filter((s) => s.sellerId === sellerId)
          .map(toRecord);
      },

      async applyTransition(id, to, actor, reason, record) {
        const s = store();
        const row = s.subOrders.get(id);
        if (!row) throw new Error(`Unknown sub-order ${id}`);

        // The adapter enforces the table too. A caller passing a hand-built
        // record must not be able to write a state the machine forbids.
        if (!SubOrderLifecycle.rule(row.state, to)) {
          throw new InvalidTransition(row.state, to);
        }

        row.state = to;
        if (to === 'delivered') row.deliveredAt = record.at;
        s.transitions.push({ ...record, from: row.state, to, actor, reason });
      },

      async listForSettlement(sellerId) {
        return [...store().subOrders.values()]
          .filter((s) => s.sellerId === sellerId)
          .map((r): SettlementSubOrder => ({
            id: r.id,
            reference: r.reference,
            state: r.state,
            merchandise: Money.fromMinor(r.merchandiseMinor),
            shipping: Money.fromMinor(r.shippingMinor),
            commissionSource: r.commissionSource,
            commissionBps: r.commissionBps,
            ...(r.deliveredAt ? { deliveredAt: r.deliveredAt } : {}),
            cashInHand: r.codRemitted,
          }));
      },
    };

    return { sellers, customers, products, orders, subOrders };
  }
}

export type { Actor, ReasonCode };
