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
import type { ContentPage } from '../content/page';
import type { ContentRepository, ContentRevision } from '../ports/content-repository';
import type { ListingRecord, ListingRepository } from '../ports/listing-repository';
import type { AuditRecord, AuditTrail } from '../ports/audit-trail';
import { SubOrderLifecycle, type Actor, type ReasonCode, type SubOrderState, type TransitionRecord } from '../state-machines/sub-order';
import { InvalidTransition } from '../errors/index';
import type { DraftOrder } from '../services/place-order';
import type { SettlementSubOrder } from '../services/settlement';
import type { PayoutStatement } from '../services/settlement';
import type {
  CustomerRecord, CustomerRepository, PayoutRepository,
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
  sku: string;
  volumeMl: number;
  quantity: number;
  unitPriceMinor: number;
}

interface SubOrderRow {
  id: string;
  reference: string;
  lines: SubOrderLineRow[];
  delivery: {
    recipientName: string;
    recipientPhone: string;
    governorate: string;
    city: string;
    area: string;
    street: string;
    building: string;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  };
  placedAt: Date;
  confirmDueAt: Date | null;
  shipment?: { courier: string; trackingNumber: string | null; dispatchedAt: Date | null };
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
  /** Snapshotted at placement — who booked and paid the courier. */
  deliveryFulfilledBy: 'seller' | 'platform';
  codRemittedAt?: Date;
}

interface PayoutRow {
  id: string;
  sellerId: string;
  reference: string;
  statement: PayoutStatement;
}

const toSummary = (p: PayoutRow) => ({
  id: p.id,
  reference: p.reference,
  status: 'accruing',
  periodStart: p.statement.periodStart,
  periodEnd: p.statement.periodEnd,
  gross: p.statement.gross,
  commission: p.statement.commission,
  net: p.statement.net,
  disputeDeadline: p.statement.disputeDeadline,
  paidAt: null,
});

interface Store {
  sellers: Map<string, SellerRecord>;
  payouts: Map<string, PayoutRow>;
  customers: Map<string, CustomerRecord>;
  products: Map<string, ProductRecord>;
  orders: Map<string, OrderRow>;
  subOrders: Map<string, SubOrderRow>;
  transitions: TransitionRecord[];
  seq: number;
}

const emptyStore = (): Store => ({
  sellers: new Map(), customers: new Map(), payouts: new Map(),
  products: new Map(), orders: new Map(),
  subOrders: new Map(), transitions: [], seq: 0,
});

const cloneStore = (s: Store): Store => ({
  sellers: new Map(s.sellers),
  customers: new Map(s.customers),
  payouts: new Map(s.payouts),
  products: new Map(s.products),
  orders: new Map([...s.orders].map(([k, v]) => [k, { ...v, subOrderIds: [...v.subOrderIds] }])),
  subOrders: new Map([...s.subOrders].map(([k, v]) => [k, { ...v }])),
  transitions: [...s.transitions],
  seq: s.seq,
});

export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly contentPages = new Map<string, ContentPage>();

  private readonly contentRevisions = new Map<string, ContentRevision>();

  private revisionCounter = 0;

  private readonly listingRows = new Map<string, ListingRecord>();

  /** Which listings have a usable primary image. Set by tests that need one. */
  readonly listingImages = new Set<string>();

  private listingTick = 0;

  readonly auditRows: AuditRecord[] = [];

  /**
   * A distinct instant per write, so `updatedAt` can order a list.
   *
   * A fixed clock would make every listing equally recent and the ordering
   * would fall back to whatever the Map iterated, which is not an ordering.
   */
  listingClock(): Date {
    this.listingTick += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.listingTick * 1000);
  }

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
      async brandsFor(sellerId) {
        // One brand per house in the fixture, named after the house. Enough to
        // exercise the shape without pretending to model a portfolio.
        const seller = store().sellers.get(sellerId);
        return seller ? [{ id: `brand-${sellerId}`, name: seller.tradingName }] : [];
      },

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
            // Copied from the order, exactly as the database does — the house
            // cannot read the parent order. Migration 0004.
            delivery: {
              recipientName: draft.contactName,
              recipientPhone: draft.contactPhone,
              governorate: draft.address.governorate,
              city: draft.address.city,
              area: draft.address.area,
              street: draft.address.street,
              building: draft.address.building,
              floor: draft.address.floor ?? null,
              apartment: draft.address.apartment ?? null,
              landmark: draft.address.landmark ?? null,
            },
            placedAt: draft.placedAt,
            confirmDueAt: sub.confirmDueAt,
            lines: sub.lineItems.map((li) => ({
              name: li.productName,
              brandName: li.brandName,
              sku: li.sku,
              volumeMl: li.volumeMl,
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
            deliveryFulfilledBy: 'seller',
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
              trackingNumber: sub.shipment?.trackingNumber ?? null,
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

      async recordShipment({ subOrderId, courier, trackingNumber, dispatchedAt }) {
        const s = store();
        const sub = s.subOrders.get(subOrderId);
        if (!sub) throw new Error(`Unknown sub-order ${subOrderId}`);
        sub.shipment = { courier, trackingNumber, dispatchedAt };
      },

      async findShipment(subOrderId) {
        return store().subOrders.get(subOrderId)?.shipment ?? null;
      },

      async listOpsQueue() {
        const s = store();
        return [...s.subOrders.values()]
          .filter((so) => so.state === 'dispatched' || so.state === 'delivered')
          .map((so) => ({
            id: so.id,
            reference: so.reference,
            state: so.state,
            sellerId: so.sellerId,
            brandName: s.sellers.get(so.sellerId)?.tradingName ?? '',
            recipientName: so.delivery.recipientName,
            total: Money.fromMinor(so.merchandiseMinor + so.shippingMinor),
            dispatchedAt: so.shipment?.dispatchedAt ?? null,
            deliveredAt: so.deliveredAt ?? null,
            trackingNumber: so.shipment?.trackingNumber ?? null,
            remitted: so.codRemitted,
          }));
      },

      async listQueueForSeller(sellerId) {
        const s = store();
        return [...s.subOrders.values()]
          .filter((so) => so.sellerId === sellerId)
          .map((so) => ({
            id: so.id,
            reference: so.reference,
            state: so.state,
            merchandise: Money.fromMinor(so.merchandiseMinor),
            shipping: Money.fromMinor(so.shippingMinor),
            placedAt: so.placedAt,
            confirmDueAt: so.confirmDueAt,
            ...so.delivery,
            items: so.lines.map((l) => ({
              name: l.name,
              sku: l.sku,
              volumeMl: l.volumeMl,
              quantity: l.quantity,
            })),
          }));
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

      async recordRemittance({ subOrderId, remittedAt }) {
        const sub = store().subOrders.get(subOrderId);
        if (!sub) throw new Error(`Unknown sub-order ${subOrderId}`);
        sub.codRemitted = true;
        sub.codRemittedAt = remittedAt;
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
            deliveryFulfilledBy: r.deliveryFulfilledBy,
          }));
      },
    };

    const payouts: PayoutRepository = {
      async save({ sellerId, reference, statement }) {
        const s = store();
        const id = `payout-${++s.seq}`;
        s.payouts.set(id, { id, sellerId, reference, statement });
        return { id, reference };
      },

      async listForSeller(sellerId) {
        return [...store().payouts.values()]
          .filter((p) => p.sellerId === sellerId)
          .map((p) => toSummary(p));
      },

      async findWithLines({ payoutId, sellerId }) {
        const row = store().payouts.get(payoutId);
        // Scoped by seller as well as id: a payout id from another house must
        // read as "not found", never as someone else's money.
        if (!row || row.sellerId !== sellerId) return null;
        return {
          ...toSummary(row),
          lines: row.statement.lines
            .filter((l) => l.outcome === 'earned' || l.outcome === 'reversed')
            .map((l) => ({
              subOrderReference: l.reference,
              gross: l.gross,
              commission: l.commission,
              commissionSource: l.commissionSource,
              commissionBps: l.commissionBps,
              shipping: l.shipping,
              net: l.net,
            })),
        };
      },
    };

    /*
     * Content, in memory.
     *
     * Exists so the contract test can run the same cases against this and the
     * Drizzle adapter. An in-memory double that nobody holds to the same
     * contract is a double that agrees with itself and with nothing else.
     */
    const contentPages = this.contentPages;
    const contentRevisions = this.contentRevisions;
    /*
     * The counter lives on the INSTANCE, reached through this reference.
     *
     * It was a local `let` copied in and written back once — which meant it
     * reset at the start of every transaction, so a second publish produced
     * `rev-1` again and quietly overwrote the first revision in the Map. The
     * contract case that keeps history caught it.
     */
    const fixture = this;
    const listingRows = this.listingRows;
    const listingImages = this.listingImages;
    const auditRows = this.auditRows;

    const content: ContentRepository = {
      async list() {
        return [...contentPages.values()].sort((a, b) => a.slug.localeCompare(b.slug));
      },

      async findById(id) {
        return contentPages.get(id) ?? null;
      },

      async findBySlug(slug) {
        return [...contentPages.values()].find((p) => p.slug === slug) ?? null;
      },

      async findLive(slug) {
        const page = [...contentPages.values()].find((p) => p.slug === slug);
        if (!page || page.state === 'archived' || !page.publishedRevisionId) return null;
        const revision = contentRevisions.get(page.publishedRevisionId);
        if (!revision) return null;
        // The FROZEN revision, never the draft. Same rule as the adapter.
        return {
          slug: page.slug,
          title: revision.title,
          blocks: revision.blocks,
          publishedAt: revision.publishedAt,
        };
      },

      async listLive() {
        return [...contentPages.values()]
          .filter((p) => p.state !== 'archived' && p.publishedRevisionId)
          .map((p) => ({
            slug: p.slug,
            title: contentRevisions.get(p.publishedRevisionId!)?.title ?? p.title,
          }))
          .sort((a, b) => a.slug.localeCompare(b.slug));
      },

      async create({ slug, title }) {
        const page: ContentPage = {
          id: `page-${contentPages.size + 1}`,
          slug,
          title,
          state: 'draft',
          draftBlocks: [],
          publishedRevisionId: null,
        };
        contentPages.set(page.id, page);
        return page;
      },

      async saveDraft(id, { title, blocks }) {
        const page = contentPages.get(id);
        if (!page) throw new Error(`No content page ${id}`);
        contentPages.set(id, { ...page, title, draftBlocks: [...blocks] });
      },

      async setState(id, state) {
        const page = contentPages.get(id);
        if (!page) throw new Error(`No content page ${id}`);
        contentPages.set(id, { ...page, state });
      },

      async publish(id, publishedBy) {
        const page = contentPages.get(id);
        if (!page) throw new Error(`No content page ${id}`);

        fixture.revisionCounter += 1;
        const revision: ContentRevision = {
          id: `rev-${fixture.revisionCounter}`,
          pageId: id,
          title: page.title,
          blocks: [...page.draftBlocks],
          publishedBy,
          // Each revision is a distinct instant, so `revisions()` can order
          // them. A fixed clock would make two publishes indistinguishable and
          // the history would come back in whatever order the Map iterated.
          publishedAt: new Date(Date.UTC(2026, 0, 1) + fixture.revisionCounter * 1000),
        };
        contentRevisions.set(revision.id, revision);
        contentPages.set(id, {
          ...page, publishedRevisionId: revision.id, state: 'published',
        });
        return revision;
      },

      async revisions(pageId) {
        return [...contentRevisions.values()]
          .filter((r) => r.pageId === pageId)
          .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      },
    };

    /*
     * Listings, in memory.
     *
     * It does NOT re-implement the status guard from migration 0010. That guard
     * is a database backstop against a caller that reached the tables another
     * way; the domain's state machine is what the application asks, and a fake
     * that enforced it twice would let a bug in the machine pass because the
     * fake caught it.
     */
    const listings: ListingRepository = {
      async listForSeller(sellerId) {
        return [...listingRows.values()]
          .filter((l) => l.sellerId === sellerId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      },

      async findForSeller(id, sellerId) {
        const row = listingRows.get(id);
        return row && row.sellerId === sellerId ? row : null;
      },

      async findAnywhere(id) {
        return listingRows.get(id) ?? null;
      },

      async create(sellerId, input) {
        const record: ListingRecord = {
          id: `listing-${listingRows.size + 1}`,
          sellerId,
          state: 'draft',
          name: input.name,
          slug: input.slug,
          sku: input.sku,
          brandId: input.brandId,
          pricePiastres: 0,
          volumeMl: 0,
          stock: 0,
          moderationReason: null,
          submittedAt: null,
          moderatedAt: null,
          updatedAt: fixture.listingClock(),
        };
        listingRows.set(record.id, record);
        return record;
      },

      async update(id, sellerId, input) {
        const row = listingRows.get(id);
        if (!row || row.sellerId !== sellerId) return;
        // `undefined` means "not sent", which is different from `null` meaning
        // "cleared" — the same distinction the adapter makes.
        const patch = Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        );
        listingRows.set(id, { ...row, ...patch, updatedAt: fixture.listingClock() });
      },

      async move(id, to, input) {
        const row = listingRows.get(id);
        if (!row) return;
        listingRows.set(id, {
          ...row,
          state: to,
          moderationReason: input.reason ?? null,
          updatedAt: input.at,
          ...(to === 'pending_moderation' ? { submittedAt: input.at } : {}),
          ...(input.moderatedBy ? { moderatedAt: input.at } : {}),
        });
      },

      async hasPrimaryImage(id) {
        return listingImages.has(id);
      },

      async moderationQueue() {
        return [...listingRows.values()]
          .filter((l) => l.state === 'pending_moderation')
          .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0))
          .map((l) => ({
            id: l.id,
            sellerId: l.sellerId,
            brandName: 'دار',
            name: l.name ?? '',
            slug: l.slug ?? '',
            pricePiastres: l.pricePiastres ?? 0,
            volumeMl: l.volumeMl ?? 0,
            submittedAt: l.submittedAt,
            claimText: [
              l.name ?? '',
              ...(l.notesTop ?? []),
              ...(l.notesHeart ?? []),
              ...(l.notesBase ?? []),
            ].filter(Boolean),
          }));
      },
    };

    const audit: AuditTrail = {
      async record(entry) {
        auditRows.push({
          ...entry,
          id: `audit-${auditRows.length + 1}`,
          occurredAt: fixture.listingClock(),
        });
      },
      async recent(options = {}) {
        return auditRows
          .filter((row) => (!options.entityTable || row.entityTable === options.entityTable)
            && (!options.entityId || row.entityId === options.entityId))
          .slice()
          .reverse()
          .slice(0, options.limit ?? 100);
      },
    };

    return {
      sellers, customers, products, orders, subOrders, payouts, content, listings, audit,
    };
  }
}

export type { Actor, ReasonCode };
