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
import type { Curation, SiteRepository } from '../ports/site-repository';
import type { Announcement } from '../content/announcement';
import type { ListingRecord, ListingRepository } from '../ports/listing-repository';
import type { PhotoRepository, StoredPhoto } from '../ports/photo-repository';
import type { ContentImage, ContentImageRepository } from '../ports/content-image-repository';
import type {
  AnalyticsRepository, BrowsingCount, RecordedBrowsingEvent,
} from '../ports/analytics-repository';
import { newestFirst, type AuditRecord, type AuditTrail } from '../ports/audit-trail';
import type { OwnerReportRepository } from '../ports/owner-report-repository';
import type { OwnerReportSubOrder } from '../insights/owner-metrics';
import type {
  ModeratedReview, PublishedReview, ReviewRepository, ReviewableLine,
} from '../ports/review-repository';
import type {
  ReturnRecord, ReturnRepository, ReturnableLine,
} from '../ports/return-repository';
import type { SupportRepository, TicketRecord } from '../ports/support-repository';
import {
  VERIFICATION_CONTROLS,
  type ApplicationRecord, type ApplicationRepository,
  type VerificationControl, type VerificationRecord, type VerificationStatus,
} from '../ports/application-repository';
import type {
  CostBearer, ReturnEligibility, ReturnReason, ReturnState,
} from '../trust/return-request';
import {
  publicAuthorName, summarise, type Ratings, type ReviewSummary,
} from '../trust/review';
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
  /** The order-level discount, as the database stores it on `orders`. */
  discountMinor: number;
  subOrderIds: string[];
}

interface SubOrderLineRow {
  /**
   * A line item is a THING, not a position in an array.
   *
   * A review, a return and a support ticket all point at one, and until this
   * existed the only way to name a line was "the second one in that sub-order"
   * — which changes meaning the moment anything is reordered.
   */
  id: string;
  productId: string;
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
  /** Snapshotted at placement, as the database does in 0020. */
  dispatchSlaHours: number;
  /** Set when the house confirms. */
  dispatchDueAt: Date | null;
  confirmedAt?: Date;
  dispatchedAt?: Date;
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

/** A review row, as the table stores it. */
interface ReviewRow {
  id: string;
  lineItemId: string;
  subOrderId: string;
  productId: string;
  customerId: string;
  ratings: Ratings;
  body: string | null;
  /** Masked and snapshotted at write time — migration 0016. */
  authorLabel: string;
  incentiveDisclosed: boolean;
  createdAt: Date;
  hiddenAt: Date | null;
  moderationNote: string | null;
  moderatedBy: string | null;
  moderatedAt: Date | null;
}

/** A return row, as the table stores it. */
interface ReturnRow {
  id: string;
  subOrderId: string;
  lineItemId: string | null;
  state: ReturnState;
  reason: ReturnReason;
  customerNote: string | null;
  costBearer: CostBearer;
  refundMinor: number | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  requestedAt: Date;
  closedAt: Date | null;
}

/**
 * A ticket row, mutable.
 *
 * `TicketRecord` is readonly all the way down, which is right for something
 * crossing the port boundary and wrong for the store behind it — the fake has
 * to be able to move a status the way an UPDATE does.
 */
type TicketRow = {
  -readonly [K in keyof TicketRecord]: TicketRecord[K];
} & { ownerId: string | null; orderId: string | null };

/** An application, and the eight controls seeded alongside it. */
interface ApplicationRow {
  record: ApplicationRecord;
  controls: Map<VerificationControl, VerificationRecord>;
}

/** A mutable photograph row, with an insertion sequence for stable ordering. */
type PhotoRow = { -readonly [K in keyof StoredPhoto]: StoredPhoto[K] } & { seq: number };

interface Store {
  sellers: Map<string, SellerRecord>;
  applications: Map<string, ApplicationRow>;
  reviews: Map<string, ReviewRow>;
  returns: Map<string, ReturnRow>;
  tickets: Map<string, TicketRow>;
  payouts: Map<string, PayoutRow>;
  customers: Map<string, CustomerRecord>;
  products: Map<string, ProductRecord>;
  orders: Map<string, OrderRow>;
  subOrders: Map<string, SubOrderRow>;
  /**
   * The append-only log, keyed to its sub-order as `sub_order_transitions` is.
   *
   * It held bare records with no sub-order id, so nothing could ask when a
   * particular order was answered — which the owner report must.
   */
  transitions: Array<TransitionRecord & { subOrderId: string }>;
  seq: number;
}

const emptyStore = (): Store => ({
  sellers: new Map(), customers: new Map(), payouts: new Map(), reviews: new Map(),
  returns: new Map(), tickets: new Map(), applications: new Map(),
  products: new Map(), orders: new Map(),
  subOrders: new Map(), transitions: [], seq: 0,
});

/** How many of the eight have passed. */
const countApproved = (row: ApplicationRow): number =>
  [...row.controls.values()].filter((c) => c.status === 'approved').length;

const cloneStore = (s: Store): Store => ({
  sellers: new Map(s.sellers),
  reviews: new Map([...s.reviews].map(([k, v]) => [k, { ...v }])),
  returns: new Map([...s.returns].map(([k, v]) => [k, { ...v }])),
  tickets: new Map([...s.tickets].map(([k, v]) => [k, { ...v }])),
  applications: new Map([...s.applications].map(([k, v]) => [k, {
    record: { ...v.record }, controls: new Map(v.controls),
  }])),
  customers: new Map(s.customers),
  payouts: new Map(s.payouts),
  products: new Map(s.products),
  orders: new Map([...s.orders].map(([k, v]) => [k, { ...v, subOrderIds: [...v.subOrderIds] }])),
  subOrders: new Map([...s.subOrders].map(([k, v]) => [k, { ...v }])),
  transitions: [...s.transitions],
  seq: s.seq,
});

export class InMemoryUnitOfWork implements UnitOfWork {
  private readonly announcements = new Map<string, Announcement>();

  private announcementCounter = 0;

  private siteCuration: Curation = { heroProductId: null, featuredProductIds: [] };

  private readonly contentPages = new Map<string, ContentPage>();

  private readonly contentRevisions = new Map<string, ContentRevision>();

  private revisionCounter = 0;

  private readonly listingRows = new Map<string, ListingRecord>();

  /**
   * A product's photographs, as `product_media` rows.
   *
   * This replaced a bare set of "listings with a usable primary image" that tests
   * were meant to fill by hand and none did. With real rows, `hasPrimaryImage`
   * applies the publish trigger's own rule, and the photo contract holds this
   * adapter to the Postgres one.
   */
  readonly photoRows = new Map<string, PhotoRow>();

  /** `content_images`, keyed by storage key — the primary key in 0022. */
  private readonly contentImageRows = new Map<string, ContentImage>();

  /** `analytics_events`. Append-only here as in the database. */
  private readonly browsingEvents: RecordedBrowsingEvent[] = [];

  private photoSeq = 0;

  nextPhotoSeq(): number {
    this.photoSeq += 1;
    return this.photoSeq;
  }

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

  /**
   * A listing's returns policy.
   *
   * A fixture map rather than a field on `ProductRecord`, because the policy is
   * a catalogue detail that only the return path reads — putting it on the
   * shared record would make every existing fixture in the repository carry a
   * field none of them are about.
   */
  readonly returnEligibility = new Map<string, ReturnEligibility>();

  setReturnEligibility(productId: string, value: ReturnEligibility): void {
    this.returnEligibility.set(productId, value);
  }

  /** Rename a customer. For the contract case that proves a byline is frozen. */
  renameCustomer(id: string, fullName: string): void {
    const row = this.store.customers.get(id);
    if (!row) throw new Error(`Unknown customer ${id}`);
    this.store.customers.set(id, { ...row, fullName });
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
    // Up here rather than beside the photo repository, because the cart
    // snapshot reads it too.
    const photoRows = this.photoRows;

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
            // The Postgres adapter's join condition, as a filter: primary AND
            // verified. A primary with no facts is not a photograph.
            const primary = [...photoRows.values()].find((row) =>
              row.productId === p.id && row.isPrimary && row.contentType !== null);
            return {
              productId: p.id,
              sellerId: p.sellerId,
              slug: p.slug,
              name: p.name,
              nameEn: null,
              brandName: seller?.tradingName ?? '',
              brandNameEn: null,
              brandLatin: (seller?.tradingName ?? '').toUpperCase(),
              sku: p.sku,
              volumeMl: p.volumeMl,
              scentFamily: 'amber',
              unitPrice: p.price,
              stock: p.stock,
              isPublished: p.status === 'published',
              isHouseLive: seller?.status === 'live',
              fulfilmentHours: 48,
              primaryPhoto: primary
                ? {
                  storageKey: primary.storageKey,
                  alt: primary.alt,
                  width: primary.width!,
                  height: primary.height!,
                }
                : null,
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
            dispatchSlaHours: sub.dispatchSlaHours,
            dispatchDueAt: null,
            lines: sub.lineItems.map((li) => ({
              id: `line-${++s.seq}`,
              productId: li.productId,
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
          discountMinor: draft.discount.minor,
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
              brandNameEn: null,
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
            dispatchDueAt: so.dispatchDueAt,
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

        /*
         * The state it moved FROM, read before the row changes.
         *
         * This used to assign `row.state = to` first and then log
         * `from: row.state`, so every recorded transition claimed to have gone
         * from its new state to its new state. Nothing reads this log through
         * the port, which is how it survived; the Postgres adapter has always
         * recorded the real previous state.
         *
         * The timestamps now match the Postgres adapter as well: it has stamped
         * `confirmed_at` and `dispatched_at` all along, and this stamped only
         * delivery.
         */
        const from = row.state;
        row.state = to;
        if (to === 'confirmed') {
          row.confirmedAt = record.at;
          row.dispatchDueAt = SubOrderLifecycle.dispatchDueAt(record.at, row.dispatchSlaHours);
        }
        if (to === 'dispatched') row.dispatchedAt = record.at;
        if (to === 'delivered') row.deliveredAt = record.at;
        s.transitions.push({ ...record, from, to, actor, reason, subOrderId: id });
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
          titleEn: revision.titleEn,
          blocksEn: revision.blocksEn,
          publishedAt: revision.publishedAt,
        };
      },

      async listLive() {
        return [...contentPages.values()]
          .filter((p) => p.state !== 'archived' && p.publishedRevisionId)
          .map((p) => ({
            slug: p.slug,
            title: contentRevisions.get(p.publishedRevisionId!)?.title ?? p.title,
            titleEn: contentRevisions.get(p.publishedRevisionId!)?.titleEn ?? null,
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
          titleEn: null,
          draftBlocksEn: [],
          publishedRevisionId: null,
        };
        contentPages.set(page.id, page);
        return page;
      },

      async saveDraft(id, { title, blocks, titleEn, blocksEn }) {
        const page = contentPages.get(id);
        if (!page) throw new Error(`No content page ${id}`);
        contentPages.set(id, {
          ...page,
          title,
          draftBlocks: [...blocks],
          ...(titleEn !== undefined ? { titleEn } : {}),
          ...(blocksEn !== undefined ? { draftBlocksEn: [...blocksEn] } : {}),
        });
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
          titleEn: page.titleEn,
          blocksEn: [...page.draftBlocksEn],
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

      async restore(pageId, revisionId) {
        const revision = contentRevisions.get(revisionId);
        // Belongs to this page, or nothing happens.
        if (!revision || revision.pageId !== pageId) return null;

        const page = contentPages.get(pageId);
        if (!page) return null;

        contentPages.set(pageId, {
          ...page,
          title: revision.title,
          draftBlocks: [...revision.blocks],
          titleEn: revision.titleEn,
          draftBlocksEn: [...revision.blocksEn],
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
        // The rule the publish trigger applies, word for word — including the
        // facts 0024 added, so this cannot report a gap closed that Postgres
        // would refuse.
        return [...photoRows.values()].some((p) => p.productId === id
          && p.isPrimary && p.ownershipConfirmed && p.alt.trim() !== ''
          && p.contentType !== null);
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
        let cursor: AuditRecord | undefined;
        if (options.before !== undefined) {
          cursor = auditRows.find((row) => row.id === options.before);
          // The same answer the SQL gives: a subselect that finds no row
          // compares as NULL, and NULL admits nothing.
          if (!cursor) return [];
        }
        return auditRows
          .filter((row) => (!options.entityTable || row.entityTable === options.entityTable)
            && (!options.entityId || row.entityId === options.entityId)
            && (!options.action || row.action === options.action)
            // Strictly after the cursor in newest-first order, i.e. older: the
            // comparator is negative when its first argument sorts first.
            && (!cursor || newestFirst(cursor, row) < 0))
          .sort(newestFirst)
          .slice(0, options.limit ?? 100);
      },
    };

    /*
     * Site-level content, in memory.
     *
     * The window predicate is HALF-OPEN here exactly as it is in SQL and in the
     * domain's `showing`. Three copies of one boundary rule is three chances to
     * disagree about the instant a window closes, which is why the contract
     * runs the same cases against both adapters.
     */
    const announcements = this.announcements;

    const site: SiteRepository = {
      async allAnnouncements() {
        return [...announcements.values()]
          .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
      },

      async currentAnnouncements(now) {
        return [...announcements.values()]
          .filter((a) => now.getTime() >= a.startsAt.getTime()
            && now.getTime() < a.endsAt.getTime())
          .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
      },

      async post(input) {
        fixture.announcementCounter += 1;
        const announcement: Announcement = {
          id: `ann-${fixture.announcementCounter}`,
          message: input.message,
          messageEn: input.messageEn ?? null,
          href: input.href,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        };
        announcements.set(announcement.id, announcement);
        return announcement;
      },

      async endAnnouncement(id, at) {
        const announcement = announcements.get(id);
        // Only one that has already started and not yet ended. Ending an
        // unstarted one would put `endsAt` before `startsAt`, which the
        // database refuses outright.
        if (!announcement) return false;
        if (at.getTime() < announcement.startsAt.getTime()) return false;
        if (at.getTime() >= announcement.endsAt.getTime()) return false;

        announcements.set(id, { ...announcement, endsAt: at });
        return true;
      },

      async curation() {
        return fixture.siteCuration;
      },

      async setCuration({ heroProductId, featuredProductIds }) {
        fixture.siteCuration = {
          heroProductId,
          featuredProductIds: [...featuredProductIds],
        };
      },
    };

    /*
     * ---------------------------------------------------------------- reviews
     *
     * The authorisation shape mirrors the SQL one exactly: everything except
     * the line item is derived from the store, starting at the two factors.
     * Nothing here compares a value the caller supplied against one it read.
     */
    const reviews: ReviewRepository = {
      async listReviewable({ reference, phone }) {
        const s = store();
        const order = [...s.orders.values()].find(
          (o) => o.reference === reference && o.contactPhone === phone,
        );
        if (!order) return [];

        const out: ReviewableLine[] = [];
        for (const subId of order.subOrderIds) {
          const sub = s.subOrders.get(subId);
          // Only what actually arrived. The database's trigger would refuse an
          // insert against anything else, and offering a form the database
          // will reject is worse than offering none.
          if (!sub || sub.state !== 'delivered') continue;

          for (const line of sub.lines) {
            const product = s.products.get(line.productId);
            out.push({
              lineItemId: line.id,
              productId: line.productId,
              productSlug: product?.slug ?? '',
              productName: line.name,
              brandName: line.brandName,
              volumeMl: line.volumeMl,
              reviewed: [...s.reviews.values()].some((r) => r.lineItemId === line.id),
            });
          }
        }
        return out;
      },

      async record({ reference, phone, lineItemId, ratings, body, incentiveDisclosed, now }) {
        const s = store();
        const order = [...s.orders.values()].find(
          (o) => o.reference === reference && o.contactPhone === phone,
        );
        if (!order) return null;

        for (const subId of order.subOrderIds) {
          const sub = s.subOrders.get(subId);
          if (!sub || sub.state !== 'delivered') continue;

          const line = sub.lines.find((l) => l.id === lineItemId);
          if (!line) continue;
          // One review per purchase — the unique index on `line_item_id`.
          if ([...s.reviews.values()].some((r) => r.lineItemId === line.id)) return null;

          const id = `review-${++s.seq}`;
          s.reviews.set(id, {
            id,
            lineItemId: line.id,
            subOrderId: sub.id,
            productId: line.productId,
            customerId: order.customerId,
            ratings,
            body: body === null ? null : body.trim() || null,
            // The DOMAIN's rule, applied once, at write. Both adapters store
            // the masked form rather than masking on every read — see 0016.
            authorLabel: publicAuthorName(
              s.customers.get(order.customerId)?.fullName ?? null,
            ),
            incentiveDisclosed,
            createdAt: now,
            hiddenAt: null,
            moderationNote: null,
            moderatedBy: null,
            moderatedAt: null,
          });
          return { id, productSlug: s.products.get(line.productId)?.slug ?? '' };
        }
        return null;
      },

      async summaryFor(productId) {
        const visible = [...store().reviews.values()]
          .filter((r) => r.productId === productId && r.hiddenAt === null);
        return summarise(visible.map((r) => r.ratings));
      },

      async summariesFor(productIds) {
        const wanted = new Set(productIds);
        const grouped = new Map<string, Ratings[]>();
        for (const row of store().reviews.values()) {
          if (row.hiddenAt !== null || !wanted.has(row.productId)) continue;
          const bucket = grouped.get(row.productId) ?? [];
          bucket.push(row.ratings);
          grouped.set(row.productId, bucket);
        }
        // Absent rather than present-with-zero: the caller substitutes the
        // value that means "nobody has said yet".
        const out = new Map<string, ReviewSummary>();
        for (const [id, ratings] of grouped) out.set(id, summarise(ratings));
        return out;
      },

      async listForProduct({ productId, limit }) {
        const s = store();
        return [...s.reviews.values()]
          .filter((r) => r.productId === productId && r.hiddenAt === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((r): PublishedReview => ({
            id: r.id,
            ratings: r.ratings,
            body: r.body,
            authorName: r.authorLabel,
            createdAt: r.createdAt,
          }));
      },

      async listForModeration({ limit }) {
        const s = store();
        return [...s.reviews.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((r): ModeratedReview => {
            const product = s.products.get(r.productId);
            const line = [...s.subOrders.values()]
              .flatMap((sub) => sub.lines)
              .find((l) => l.id === r.lineItemId);
            return {
              id: r.id,
              ratings: r.ratings,
              body: r.body,
              authorName: r.authorLabel,
              createdAt: r.createdAt,
              productId: r.productId,
              productSlug: product?.slug ?? '',
              productName: line?.name ?? product?.name ?? '',
              brandName: line?.brandName ?? '',
              hiddenAt: r.hiddenAt,
              moderationNote: r.moderationNote,
            };
          });
      },

      async hide({ id, note, moderatorId, now }) {
        const row = store().reviews.get(id);
        if (!row || row.hiddenAt !== null) return false;
        row.hiddenAt = now;
        row.moderationNote = note;
        row.moderatedBy = moderatorId;
        row.moderatedAt = now;
        return true;
      },

      async restore({ id, moderatorId, now }) {
        const row = store().reviews.get(id);
        if (!row || row.hiddenAt === null) return false;
        row.hiddenAt = null;
        // The note stays. It is the record of a decision that was made and then
        // reversed, and erasing it would leave the reversal unexplained too.
        row.moderatedBy = moderatorId;
        row.moderatedAt = now;
        return true;
      },
    };

    /*
     * ---------------------------------------------------------------- returns
     *
     * Same authorisation shape as reviews: the two factors reach the order, the
     * line item names one bottle, and everything else is derived. What differs
     * is that a return is JUDGED elsewhere — this returns the facts and the
     * domain rules on them.
     */
    const eligibilityOf = (productId: string): ReturnEligibility | null =>
      fixture.returnEligibility.get(productId) ?? null;

    const orderFor = (reference: string, phone: string) =>
      [...store().orders.values()].find(
        (o) => o.reference === reference && o.contactPhone === phone,
      );

    const toReturnRecord = (row: ReturnRow): ReturnRecord => {
      const s = store();
      const sub = s.subOrders.get(row.subOrderId)!;
      const line = row.lineItemId === null
        ? undefined
        : sub.lines.find((l) => l.id === row.lineItemId);
      return {
        id: row.id,
        subOrderId: row.subOrderId,
        subOrderReference: sub.reference,
        sellerId: sub.sellerId,
        brandName: s.sellers.get(sub.sellerId)?.tradingName ?? '',
        lineItemId: row.lineItemId,
        productName: line?.name ?? null,
        state: row.state,
        reason: row.reason,
        customerNote: row.customerNote,
        costBearer: row.costBearer,
        refund: row.refundMinor === null ? null : Money.fromMinor(row.refundMinor),
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt,
        closedAt: row.closedAt,
      };
    };

    const returns: ReturnRepository = {
      async listReturnable({ reference, phone }) {
        const s = store();
        const order = orderFor(reference, phone);
        if (!order) return [];

        const out: ReturnableLine[] = [];
        for (const subId of order.subOrderIds) {
          const sub = s.subOrders.get(subId);
          if (!sub) continue;

          for (const line of sub.lines) {
            out.push({
              lineItemId: line.id,
              subOrderId: sub.id,
              subOrderReference: sub.reference,
              productName: line.name,
              brandName: line.brandName,
              volumeMl: line.volumeMl,
              quantity: line.quantity,
              unitPrice: Money.fromMinor(line.unitPriceMinor),
              // Null until it arrives. "Not here yet" is a different answer
              // from "not yours", and the screen has to say which.
              deliveredAt: sub.state === 'delivered' ? sub.deliveredAt ?? null : null,
              eligibility: eligibilityOf(line.productId),
              alreadyRequested: [...s.returns.values()].some(
                (r) => r.lineItemId === line.id,
              ),
            });
          }
        }
        return out;
      },

      async request({ reference, phone, lineItemId, reason, note, costBearer, now }) {
        const s = store();
        const order = orderFor(reference, phone);
        if (!order) return null;

        for (const subId of order.subOrderIds) {
          const sub = s.subOrders.get(subId);
          if (!sub) continue;
          const line = sub.lines.find((l) => l.id === lineItemId);
          if (!line) continue;
          if ([...s.returns.values()].some((r) => r.lineItemId === line.id)) return null;

          const id = `return-${++s.seq}`;
          s.returns.set(id, {
            id,
            subOrderId: sub.id,
            lineItemId: line.id,
            state: 'requested',
            reason,
            customerNote: note.trim() || null,
            costBearer,
            refundMinor: null,
            decidedBy: null,
            decidedAt: null,
            requestedAt: now,
            closedAt: null,
          });
          return { id };
        }
        return null;
      },

      async listForOrder({ reference, phone }) {
        const s = store();
        const order = orderFor(reference, phone);
        if (!order) return [];
        const owned = new Set(order.subOrderIds);
        return [...s.returns.values()]
          .filter((r) => owned.has(r.subOrderId))
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
          .map(toReturnRecord);
      },

      async listForSeller(sellerId) {
        const s = store();
        return [...s.returns.values()]
          .filter((r) => s.subOrders.get(r.subOrderId)?.sellerId === sellerId)
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
          .map(toReturnRecord);
      },

      async listAll({ limit }) {
        return [...store().returns.values()]
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
          .slice(0, limit)
          .map(toReturnRecord);
      },

      async findById(id) {
        const row = store().returns.get(id);
        return row ? toReturnRecord(row) : null;
      },

      async move({ id, expectedFrom, to, decidedBy, costBearer, refundPiastres, now }) {
        const row = store().returns.get(id);
        // Conditional on the state the caller decided against. Two operators
        // clicking at once must not both succeed.
        if (!row || row.state !== expectedFrom) return false;

        row.state = to;
        row.decidedBy = decidedBy;
        row.decidedAt = now;
        if (costBearer !== undefined) row.costBearer = costBearer;
        if (refundPiastres !== undefined) row.refundMinor = refundPiastres;
        if (to === 'closed') row.closedAt = now;
        return true;
      },
    };

    /*
     * ---------------------------------------------------------------- support
     *
     * The order link is resolved against the caller's own phone here too. A
     * reference typed into a public form is a claim about somebody else's order
     * until it is checked.
     */
    const support: SupportRepository = {
      async open(input) {
        const s = store();
        const id = `ticket-${++s.seq}`;
        const order = input.orderReference === null ? undefined : [...s.orders.values()].find(
          (o) => o.reference === input.orderReference && o.contactPhone === input.contactPhone,
        );

        const record: TicketRecord = {
          id,
          reference: input.reference,
          category: input.category,
          subject: input.subject.trim(),
          message: input.message.trim(),
          contactName: input.contactName.trim(),
          contactPhone: input.contactPhone,
          priority: input.priority,
          status: 'open',
          // Null when the reference belongs to somebody else. The ticket is
          // still opened — a mistyped order number should still reach a human.
          orderReference: order?.reference ?? null,
          nextAction: null,
          createdAt: input.now,
          firstResponseAt: null,
          resolvedAt: null,
        };
        s.tickets.set(id, { ...record, ownerId: null, orderId: order?.id ?? null });
        return record;
      },

      async find({ reference, phone }) {
        const row = [...store().tickets.values()].find(
          (t) => t.reference === reference && t.contactPhone === phone,
        );
        return row ? { ...row } : null;
      },

      async listOpen({ limit }) {
        return [...store().tickets.values()]
          .filter((t) => t.status === 'open' || t.status === 'waiting')
          // Priority, then oldest. Sorted by arrival, this morning's P1 sits
          // behind twelve questions from last week.
          .sort((a, b) => (a.priority === b.priority
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : a.priority.localeCompare(b.priority)))
          .slice(0, limit)
          .map((t) => ({ ...t }));
      },

      async listAll({ limit }) {
        return [...store().tickets.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((t) => ({ ...t }));
      },

      async update({ id, status, nextAction, ownerId, now }) {
        const row = store().tickets.get(id);
        if (!row) return false;

        row.status = status;
        row.nextAction = nextAction;
        row.ownerId = ownerId;
        if (status === 'resolved' || status === 'closed') row.resolvedAt = now;
        // Stamped once. A field overwritten on every update measures the last
        // touch, which always looks excellent.
        if (row.firstResponseAt === null) row.firstResponseAt = now;
        return true;
      },
    };

    /*
     * ----------------------------------------------------------- applications
     *
     * The eight controls are created with the application, mirroring the
     * trigger in migration 0001 — "6 of 8" has to be a count of rows that
     * exist, not a calculation over rows that might not.
     */
    const applications: ApplicationRepository = {
      async apply(input) {
        const s = store();
        // The slug is the storefront address and it is unique. Two houses
        // choosing one wordmark is ordinary, not exceptional.
        const taken = [...s.applications.values()].some((a) => a.record.slug === input.slug)
          || [...s.sellers.values()].some((seller) => seller.slug === input.slug);
        if (taken) return null;

        const id = `application-${++s.seq}`;
        s.applications.set(id, {
          record: {
            id,
            tradingName: input.tradingName.trim(),
            slug: input.slug,
            ownerName: input.ownerName.trim(),
            contactPhone: input.contactPhone,
            contactEmail: input.contactEmail?.trim() || null,
            city: input.city.trim(),
            status: 'applied',
            applicationNote: input.note.trim(),
            appliedAt: input.now,
            approvedControls: 0,
          },
          controls: new Map(VERIFICATION_CONTROLS.map((control) => [control, {
            control, status: 'pending' as VerificationStatus, notes: null, reviewedAt: null,
          }])),
        });
        return { id, slug: input.slug };
      },

      async listApplications() {
        return [...store().applications.values()]
          .filter((a) => ['applied', 'under_review', 'approved'].includes(a.record.status))
          // Oldest first. The applicant who has waited three weeks is the one
          // most likely to give up, and newest-first hides them.
          .sort((a, b) => (a.record.appliedAt?.getTime() ?? 0) - (b.record.appliedAt?.getTime() ?? 0))
          .map((a) => ({ ...a.record, approvedControls: countApproved(a) }));
      },

      async findApplication(id) {
        const row = store().applications.get(id);
        return row ? { ...row.record, approvedControls: countApproved(row) } : null;
      },

      async verifications(sellerId) {
        const row = store().applications.get(sellerId);
        return row ? [...row.controls.values()] : [];
      },

      async setVerification({ sellerId, control, status, notes, now }) {
        const row = store().applications.get(sellerId);
        if (!row || !row.controls.has(control)) return false;
        row.controls.set(control, { control, status, notes, reviewedAt: now });
        return true;
      },

      async setStatus({ id, status }) {
        const row = store().applications.get(id);
        if (!row) return false;
        row.record = { ...row.record, status };
        return true;
      },
    };

    /*
     * The owner report's facts, in memory.
     *
     * The same shape the Postgres adapter reads out of five tables: the cohort
     * of orders placed in the period, each sub-order with what a payout would
     * need, the first confirm-or-decline from the log as the ANSWER, and the
     * reason on the move into a terminal state. It judges nothing — that is
     * `buildOwnerReport`'s job, on both sides of the contract.
     */
    const ownerReport: OwnerReportRepository = {
      async facts({ from, to }) {
        const s = store();
        const inPeriod = (d: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();
        const exits = new Set(['rejected', 'cancelled', 'refused', 'returned']);

        const cohort = [...s.orders.values()].filter((o) => inPeriod(o.placedAt));
        const orderIds = new Set(cohort.map((o) => o.id));
        const subs = [...s.subOrders.values()].filter((so) => orderIds.has(so.orderId));
        const subIds = new Set(subs.map((so) => so.id));

        const rows: OwnerReportSubOrder[] = subs.map((so) => {
          const log = s.transitions.filter((t) => t.subOrderId === so.id);
          const answers = log
            .filter((t) => t.to === 'confirmed' || t.to === 'rejected')
            .map((t) => t.at.getTime());
          const intoExit = exits.has(so.state) ? log.filter((t) => t.to === so.state) : [];
          const exit = intoExit[intoExit.length - 1];

          return {
            id: so.id,
            reference: so.reference,
            state: so.state,
            merchandise: Money.fromMinor(so.merchandiseMinor),
            shipping: Money.fromMinor(so.shippingMinor),
            commissionSource: so.commissionSource,
            commissionBps: so.commissionBps,
            ...(so.deliveredAt ? { deliveredAt: so.deliveredAt } : {}),
            cashInHand: so.codRemitted,
            deliveryFulfilledBy: so.deliveryFulfilledBy,
            orderId: so.orderId,
            sellerId: so.sellerId,
            governorate: so.delivery.governorate,
            placedAt: so.placedAt,
            confirmDueAt: so.confirmDueAt,
            respondedAt: answers.length > 0 ? new Date(Math.min(...answers)) : null,
            confirmedAt: so.confirmedAt ?? null,
            dispatchDueAt: so.dispatchDueAt,
            dispatchedAt: so.dispatchedAt ?? null,
            exitReason: exit?.reason ?? null,
            reserveDays: s.sellers.get(so.sellerId)?.payoutReserveDays ?? 0,
          };
        });

        const refunds = [...s.returns.values()]
          .filter((r) => subIds.has(r.subOrderId) && r.costBearer === 'platform')
          .reduce((sum, r) => sum + (r.refundMinor ?? 0), 0);

        return {
          subOrders: rows,
          platformRefunds: Money.fromMinor(refunds),
          ticketCount: [...s.tickets.values()].filter((t) => inPeriod(t.createdAt)).length,
          discounts: Money.fromMinor(cohort.reduce((sum, o) => sum + o.discountMinor, 0)),
        };
      },
    };

    /*
     * Photographs, in memory — the same promises the Drizzle adapter keeps with
     * a partial unique index: first photograph primary, exactly one primary,
     * removing a primary promotes the next by position.
     */
    const orderedPhotos = (productId: string) => [...photoRows.values()]
      .filter((p) => p.productId === productId)
      .sort((a, b) => a.position - b.position || a.seq - b.seq);

    const toStoredPhoto = ({ seq: _seq, ...photo }: PhotoRow): StoredPhoto => ({ ...photo });

    const photos: PhotoRepository = {
      async listForProduct(productId) {
        return orderedPhotos(productId).map(toStoredPhoto);
      },

      async add(productId, photo) {
        const existing = orderedPhotos(productId);
        const seq = fixture.nextPhotoSeq();
        const row: PhotoRow = {
          id: `photo-${seq}`,
          productId,
          storageKey: photo.storageKey,
          alt: photo.alt.trim(),
          position: existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.position)) + 1,
          isPrimary: !existing.some((p) => p.isPrimary),
          ownershipConfirmed: photo.ownershipConfirmed,
          contentType: photo.contentType,
          byteSize: photo.byteSize,
          width: photo.width,
          height: photo.height,
          seq,
        };
        photoRows.set(row.id, row);
        return toStoredPhoto(row);
      },

      async describe(photoId, productId, input) {
        const row = photoRows.get(photoId);
        if (!row || row.productId !== productId) return false;
        row.alt = input.alt.trim();
        row.ownershipConfirmed = input.ownershipConfirmed;
        return true;
      },

      async makePrimary(photoId, productId) {
        const row = photoRows.get(photoId);
        if (!row || row.productId !== productId) return false;
        for (const p of orderedPhotos(productId)) p.isPrimary = p.id === photoId;
        return true;
      },

      async reorder(productId, orderedIds) {
        for (const [position, id] of orderedIds.entries()) {
          const row = photoRows.get(id);
          if (row && row.productId === productId) row.position = position;
        }
      },

      async remove(photoId, productId) {
        const row = photoRows.get(photoId);
        if (!row || row.productId !== productId) return null;
        photoRows.delete(photoId);
        if (row.isPrimary) {
          const [next] = orderedPhotos(productId);
          if (next) next.isPrimary = true;
        }
        return toStoredPhoto(row);
      },
    };

    const contentImageRows = this.contentImageRows;
    const contentImages: ContentImageRepository = {
      async record(image) {
        // The first record wins, as `ON CONFLICT DO NOTHING` does: facts read
        // from the bytes once are not rewritten by a retry.
        const existing = contentImageRows.get(image.storageKey);
        if (existing) return existing;
        const row: ContentImage = { ...image };
        contentImageRows.set(row.storageKey, row);
        return row;
      },

      async findByKeys(keys) {
        return [...new Set(keys)]
          .map((key) => contentImageRows.get(key))
          .filter((row): row is ContentImage => row !== undefined);
      },
    };

    const browsingEvents = this.browsingEvents;
    const analytics: AnalyticsRepository = {
      async record(event) {
        browsingEvents.push({ ...event });
      },

      async countsInPeriod(from, to) {
        const inPeriod = browsingEvents.filter((event) =>
          event.occurredAt.getTime() >= from.getTime() && event.occurredAt.getTime() < to.getTime());

        const byName = new Map<string, { events: number; visitors: Set<string> }>();
        for (const event of inPeriod) {
          const row = byName.get(event.name) ?? { events: 0, visitors: new Set<string>() };
          row.events += 1;
          row.visitors.add(event.anonymousId);
          byName.set(event.name, row);
        }

        return [...byName.entries()].map(([name, row]): BrowsingCount => ({
          name: name as BrowsingCount['name'],
          events: row.events,
          // Distinct visitors, as the SQL adapter's `count(distinct …)` does.
          visitors: row.visitors.size,
        }));
      },
    };

    /*
     * The two ports this double deliberately does NOT implement.
     *
     * Every other repository here is a faithful second implementation, and the
     * contract suites run against both so neither is trusted alone. These two
     * cannot be, and pretending otherwise would be worse than refusing.
     *
     * `catalogue` is a READ MODEL joined across products, brands, houses and
     * media. This store holds no brands and no media, so a second
     * implementation would answer a different question from the real one while
     * looking like agreement.
     *
     * `identity` is worse: its entire contract is WHAT ROW-LEVEL SECURITY
     * PERMITS. The reads themselves are trivial — a phone to an id — and the
     * guarantee is that the `identity` role may perform exactly those and
     * nothing else. A `Map` cannot express that. A double that answered them
     * would prove the query shape and quietly assert a security property it has
     * no way to check, which is the one kind of green test worth less than none.
     *
     * Both are proved against a real Postgres instead:
     * `packages/db/src/catalogue-read-model.test.ts` and
     * `packages/db/src/identity-repository.test.ts`.
     */
    const refuse = (port: string, proved: string) => () => {
      throw new Error(
        `${port} has no in-memory implementation on purpose. Its contract is what the `
        + `database enforces, which this double cannot express. It is proved against a real `
        + `Postgres in ${proved}.`,
      );
    };

    const catalogue = {
      publishedProducts: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      productBySlug: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      houseBySlug: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      publishedProductsForHouse: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      houses: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      search: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      noteGlossary: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      houseFilterOptions: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
      primaryPhotos: refuse('CatalogueReadModel', 'catalogue-read-model.test.ts'),
    } as unknown as Repositories['catalogue'];

    const identity = {
      sellerByContactPhone: refuse('IdentityRepository', 'identity-repository.test.ts'),
      operatorByPhone: refuse('IdentityRepository', 'identity-repository.test.ts'),
      openSession: refuse('IdentityRepository', 'identity-repository.test.ts'),
      activeSellerSession: refuse('IdentityRepository', 'identity-repository.test.ts'),
      activeOperatorSession: refuse('IdentityRepository', 'identity-repository.test.ts'),
      revokeSession: refuse('IdentityRepository', 'identity-repository.test.ts'),
      revokeAllSessions: refuse('IdentityRepository', 'identity-repository.test.ts'),
    } as unknown as Repositories['identity'];

    /*
     * The glossary is exercised against real Postgres
     * (`packages/db/src/note-glossary.test.ts`), where its RLS lives; a fake
     * here would only prove the fake.
     */
    const glossary = {
      entries: refuse('NoteGlossaryRepository', 'note-glossary.test.ts'),
      set: refuse('NoteGlossaryRepository', 'note-glossary.test.ts'),
      remove: refuse('NoteGlossaryRepository', 'note-glossary.test.ts'),
    } as unknown as Repositories['glossary'];

    /*
     * Reliefs, likewise: who may write one is row security in Postgres
     * (`packages/db/src/relief-repository.test.ts`).
     */
    const reliefs = {
      overview: refuse('ReliefRepository', 'relief-repository.test.ts'),
      forPhoto: refuse('ReliefRepository', 'relief-repository.test.ts'),
      forPhotos: refuse('ReliefRepository', 'relief-repository.test.ts'),
      put: refuse('ReliefRepository', 'relief-repository.test.ts'),
      remove: refuse('ReliefRepository', 'relief-repository.test.ts'),
    } as unknown as Repositories['reliefs'];

    return {
      sellers, customers, products, orders, subOrders, payouts, content, listings, audit,
      site, reviews, returns, support, applications, ownerReport, photos, contentImages,
      analytics, catalogue, glossary, identity, reliefs,
    };
  }
}

export type { Actor, ReasonCode };
