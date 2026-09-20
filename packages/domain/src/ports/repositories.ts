import type { SiteRepository } from './site-repository';
import type { AuditTrail } from './audit-trail';
import type { OwnerReportRepository } from './owner-report-repository';
import type { PhotoRepository } from './photo-repository';
import type { ListingRepository } from './listing-repository';
import type { ReviewRepository } from './review-repository';
import type { ReturnRepository } from './return-repository';
import type { SupportRepository } from './support-repository';
import type { ApplicationRepository } from './application-repository';
import type { ContentRepository } from './content-repository';
import type { ContentImageRepository } from './content-image-repository';
import type { AnalyticsRepository } from './analytics-repository';
import type { CatalogueReadModel } from './catalogue-read-model';
import type { IdentityRepository } from './identity-repository';
/**
 * Repository ports.
 *
 * Pattern — Repository + Unit of Work (ENGINEERING_PRINCIPLES §4).
 *
 * The domain asks for orders; it never sees Drizzle, a connection, or SQL. That
 * is what lets the entire money engine be exercised with no database at all, and
 * what keeps `packages/domain` importable from a React Native app.
 *
 * Interface Segregation applies: these are several narrow ports rather than one
 * `Repository` with thirty methods, so a consumer depends only on what it uses.
 */
import type { Money } from '../value-objects/money';
import type { OrderSource } from '../policies/commission';
import type {
  Actor, ReasonCode, SubOrderState, TransitionRecord,
} from '../state-machines/sub-order';
import type { DraftOrder } from '../services/place-order';
import type { PayoutStatement, SettlementSubOrder } from '../services/settlement';

export interface SellerRecord {
  readonly id: string;
  readonly slug: string;
  readonly tradingName: string;
  readonly status: string;
  readonly confirmationSlaHours: number;
  readonly dispatchSlaHours: number;
  readonly payoutReserveDays: number;
  readonly disputeWindowDays: number;
}

export interface ProductRecord {
  readonly id: string;
  readonly sellerId: string;
  readonly slug: string;
  readonly name: string;
  readonly sku: string;
  readonly price: Money;
  readonly volumeMl: number;
  readonly stock: number;
  readonly status: string;
}

/**
 * Everything the cart needs to price one product, in one row.
 *
 * A READ MODEL owned by the port, not by the service, so the dependency runs
 * service -> port and the cart never learns how a catalogue row is stored.
 *
 * It carries `isHouseLive` alongside `isPublished` because availability has two
 * independent switches. A published listing belonging to a suspended house must
 * stop selling instantly, and a cart priced from the listing alone would keep
 * taking money for it.
 */
/**
 * A product's verified primary photograph, as the cart carries it.
 *
 * A storage KEY, never a URL: which store the photograph lives in is the API's
 * business, and a domain type holding a URL would hand a CDN hostname to every
 * layer that touches a cart line.
 */
export interface CartPhoto {
  readonly storageKey: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface CatalogueSnapshot {
  readonly productId: string;
  readonly sellerId: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly brandLatin: string;
  readonly sku: string;
  readonly volumeMl: number;
  readonly scentFamily: string;
  readonly unitPrice: Money;
  readonly stock: number;
  readonly isPublished: boolean;
  readonly isHouseLive: boolean;
  readonly fulfilmentHours: number;
  /**
   * The primary photograph, when it came through the verified upload flow.
   * Null otherwise — including a primary row with no facts (0021) — and the bag
   * draws the flacon, exactly as the product tile does.
   */
  readonly primaryPhoto: CartPhoto | null;
}

export interface PersistedOrder {
  readonly id: string;
  readonly reference: string;
  readonly source: OrderSource;
  readonly total: Money;
  readonly subOrderIds: readonly string[];
}

export interface SubOrderRecord {
  readonly id: string;
  readonly reference: string;
  readonly sellerId: string;
  readonly orderId: string;
  readonly state: SubOrderState;
  readonly merchandise: Money;
  readonly shipping: Money;
}

export interface BrandRecord {
  readonly id: string;
  readonly name: string;
}

export interface SellerRepository {
  findById(id: string): Promise<SellerRecord | null>;
  findBySlug(slug: string): Promise<SellerRecord | null>;
  /**
   * The house's brands.
   *
   * A listing belongs to a brand, not directly to a house — most houses have
   * one, and the ones that will have several are the reason this returns a list
   * rather than the single row today's console needs.
   */
  brandsFor(sellerId: string): Promise<readonly BrandRecord[]>;
}

export interface CustomerRecord {
  readonly id: string;
  readonly phone: string;
  readonly fullName: string | null;
  /** Null while the record exists only from guest checkout. */
  readonly authUserId: string | null;
}

export interface CustomerRepository {
  /**
   * The phone number IS the identity (CLAUDE.md §16), so a returning guest is
   * the same customer whether or not they ever created an account. Two orders
   * from one phone must not become two customers, or order history, repeat
   * attribution and support all fracture along an invisible seam.
   */
  findOrCreateByPhone(input: {
    readonly phone: string;
    readonly fullName: string;
  }): Promise<CustomerRecord>;

  /**
   * Houses this customer has bought from before.
   *
   * Drives `direct_repeat` attribution, which is the LOW commission rate — a
   * house should not pay the marketplace rate for a customer it already earned.
   * Getting this wrong overcharges sellers quietly.
   */
  listPriorPurchaseSellerIds(customerId: string): Promise<ReadonlySet<string>>;
}

export interface ProductRepository {
  findBySlug(slug: string): Promise<ProductRecord | null>;
  listPublishedBySeller(sellerId: string): Promise<readonly ProductRecord[]>;

  /**
   * Price-time snapshot of many products in ONE read.
   *
   * Deliberately not N calls to findBySlug: a five-line cart would issue five
   * round trips on the checkout path, and the five would not be consistent with
   * each other — a price could change between the second and the fourth, and
   * the customer would be shown a total that never existed.
   *
   * Ids that do not resolve are simply absent from the result. The caller
   * decides what a missing product means; the repository does not invent one.
   */
  snapshotForCart(productIds: readonly string[]): Promise<readonly CatalogueSnapshot[]>;
}

export interface OrderRepository {
  /**
   * Persist a draft order with its sub-orders and line items ATOMICALLY.
   *
   * A partially written multi-seller order is unrecoverable: one house would see
   * work it is not being paid for, and the customer's total would not reconcile.
   * Implementations must use a transaction.
   */
  save(draft: DraftOrder, sellerIdBySlug: ReadonlyMap<string, string>): Promise<PersistedOrder>;
  findByReference(reference: string): Promise<PersistedOrder | null>;

  /**
   * Order tracking, for a customer with no account.
   *
   * The phone is a PREDICATE, not a check performed afterwards. That is the
   * whole design of this method and the reason it exists separately from
   * `findByReference`: the first version of the tracking endpoint accepted a
   * phone, described itself as two-factor, and never compared it — so any
   * leaked reference disclosed the order, the name and the address. A
   * comparison is a step that can be forgotten; a WHERE clause cannot be.
   *
   * Returns null for a wrong phone exactly as it does for an unknown
   * reference, so the endpoint cannot be used to test whether a reference
   * exists.
   */
  findForCustomerLookup(input: {
    readonly reference: string;
    readonly phone: string;
  }): Promise<OrderLookup | null>;
}

export interface OrderLookupItem {
  readonly name: string;
  readonly brandName: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface OrderLookupHouse {
  readonly subOrderId: string;
  /** Null until the house hands the parcel over. */
  readonly trackingNumber: string | null;
  readonly reference: string;
  readonly sellerId: string;
  readonly brandName: string;
  readonly state: string;
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly items: readonly OrderLookupItem[];
}

export interface OrderLookup {
  readonly reference: string;
  readonly contactName: string;
  readonly placedAt: Date;
  readonly paymentMethod: string;
  readonly total: Money;
  readonly houses: readonly OrderLookupHouse[];
}

export interface QueueItem {
  readonly name: string;
  readonly sku: string;
  readonly volumeMl: number;
  readonly quantity: number;
}

/**
 * A sub-order as the HOUSE needs to see it.
 *
 * Everything required to decide and to pack, and nothing more: no order total
 * across other houses, no customer record, no attribution trail.
 */
export interface QueueEntry {
  readonly id: string;
  readonly reference: string;
  readonly state: string;
  readonly merchandise: Money;
  readonly shipping: Money;
  readonly placedAt: Date;
  /** When the confirmation SLA expires. The countdown the house is racing. */
  readonly confirmDueAt: Date | null;
  /**
   * When a CONFIRMED order must be shipped. Null until the house confirms —
   * the clock starts then, from the hours snapshotted at placement.
   */
  readonly dispatchDueAt: Date | null;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly governorate: string;
  readonly city: string;
  readonly area: string;
  readonly street: string;
  readonly building: string;
  readonly floor: string | null;
  readonly apartment: string | null;
  readonly landmark: string | null;
  readonly items: readonly QueueItem[];
}

export interface OpsQueueEntry {
  readonly id: string;
  readonly reference: string;
  readonly state: string;
  readonly sellerId: string;
  readonly brandName: string;
  readonly recipientName: string;
  readonly total: Money;
  readonly dispatchedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly trackingNumber: string | null;
  /** COD collected and handed over. The gate settlement waits on. */
  readonly remitted: boolean;
}

export interface SubOrderRepository {
  findById(id: string): Promise<SubOrderRecord | null>;
  listBySeller(sellerId: string): Promise<readonly SubOrderRecord[]>;

  /**
   * The house's working queue: what to pack and where to send it.
   *
   * Separate from `listBySeller` because that returns the settlement view, and
   * a house staring at an order queue needs the address and the line items
   * rather than commission figures.
   */
  listQueueForSeller(sellerId: string): Promise<readonly QueueEntry[]>;

  /**
   * What needs a human at the marketplace, across every house.
   *
   * Deliberately narrow: only sub-orders WAITING on an operator. A dashboard
   * listing everything is a dashboard nobody reads, and the two things that
   * actually stall are a parcel nobody has confirmed arrived and cash nobody
   * has recorded arriving. Both block a house getting paid.
   */
  listOpsQueue(): Promise<readonly OpsQueueEntry[]>;

  /**
   * Record that a parcel has been handed to a courier.
   *
   * Separate from `applyTransition` because a shipment is a FACT about the
   * world — a physical parcel with a number on it — while the transition is a
   * fact about our record of it. They are written in the same transaction, so
   * a dispatched sub-order can never exist without the shipment that explains
   * where the parcel went.
   *
   * `codAmountPiastres` is carried on the shipment because it is what the
   * courier must collect at the door, and settlement later reconciles what was
   * remitted against it. A shipment that does not know its own COD value
   * cannot be reconciled at all.
   */
  recordShipment(input: {
    readonly subOrderId: string;
    readonly courier: string;
    readonly trackingNumber: string;
    readonly labelUrl: string | null;
    readonly codAmountPiastres: number;
    readonly dispatchedAt: Date;
  }): Promise<void>;

  /** The parcel for a sub-order, if one has been handed over. */
  findShipment(subOrderId: string): Promise<{
    readonly courier: string;
    readonly trackingNumber: string | null;
    readonly dispatchedAt: Date | null;
  } | null>;

  /**
   * Move a sub-order, recording the transition.
   *
   * The state machine is applied by the caller (domain), the record is appended
   * here, and the database enforces the same table a third time. Implementations
   * must write the new state and the transition row in ONE transaction, or an
   * order can end up in a state with no audit row explaining how it got there.
   */
  applyTransition(
    id: string,
    to: SubOrderState,
    actor: Actor,
    reason: ReasonCode | null,
    record: TransitionRecord,
  ): Promise<void>;

  /** Everything a settlement period needs, already shaped for the domain. */
  listForSettlement(sellerId: string): Promise<readonly SettlementSubOrder[]>;

  /** COD: the courier has handed over the cash. The gate settlement waits on. */
  recordRemittance(input: {
    readonly subOrderId: string;
    readonly collectedPiastres: number;
    readonly remittedAt: Date;
  }): Promise<void>;
}

export interface PayoutRepository {
  /**
   * Persist a statement produced by `SettlementService`.
   *
   * The statement is written WHOLE — header and every line, in one transaction.
   * A payout header without its lines is a number a house is asked to trust
   * with nothing behind it, and doc 03 §7 requires every payout to carry an
   * itemised statement. Half a statement is worse than none, because it looks
   * complete.
   *
   * Only `earned` and `reversed` lines are persisted. Held and excluded ones
   * are not money moving in this period; they reappear in a later run when the
   * hold clears, and writing them now would double-count them then.
   */
  save(input: {
    readonly sellerId: string;
    readonly reference: string;
    readonly statement: PayoutStatement;
  }): Promise<{ readonly id: string; readonly reference: string }>;

  listForSeller(sellerId: string): Promise<readonly PayoutSummary[]>;

  findWithLines(input: {
    readonly payoutId: string;
    readonly sellerId: string;
  }): Promise<PayoutDetail | null>;
}

export interface PayoutSummary {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly gross: Money;
  readonly commission: Money;
  readonly net: Money;
  readonly disputeDeadline: Date | null;
  readonly paidAt: Date | null;
}

export interface PayoutDetailLine {
  readonly subOrderReference: string;
  readonly gross: Money;
  readonly commission: Money;
  readonly commissionSource: string;
  readonly commissionBps: number;
  readonly shipping: Money;
  readonly net: Money;
}

export interface PayoutDetail extends PayoutSummary {
  readonly lines: readonly PayoutDetailLine[];
}

/** All ports, handed to a use-case together. */
export interface Repositories {
  readonly sellers: SellerRepository;
  readonly customers: CustomerRepository;
  readonly products: ProductRepository;
  readonly orders: OrderRepository;
  readonly payouts: PayoutRepository;
  readonly subOrders: SubOrderRepository;
  readonly content: ContentRepository;
  readonly site: SiteRepository;
  readonly listings: ListingRepository;
  readonly reviews: ReviewRepository;
  readonly returns: ReturnRepository;
  readonly support: SupportRepository;
  readonly applications: ApplicationRepository;
  readonly audit: AuditTrail;
  /** Platform-only by nature: the facts behind the owner's report, across every house. */
  readonly ownerReport: OwnerReportRepository;
  /** A product's photographs. House scoping is checked by the caller and by RLS. */
  readonly photos: PhotoRepository;
  /** The verified images an editorial page may show. */
  readonly contentImages: ContentImageRepository;
  /** The browsing trail: append one event, read counts for a period. */
  readonly analytics: AnalyticsRepository;
  /**
   * The shopfront's reads (ADR-10). A READ MODEL rather than a repository: it
   * loads the shape a page renders, joined across products, brands, houses and
   * media, and nothing in it is ever written back.
   */
  readonly catalogue: CatalogueReadModel;
  /**
   * Who is signing in, and are they still allowed to be.
   *
   * Every method is refused unless the Unit of Work carries the `identity`
   * service role, which is set only inside a sign-in transaction on the server.
   */
  readonly identity: IdentityRepository;
}

/**
 * Unit of Work.
 *
 * Order + sub-orders + line items + attribution + events commit together or not
 * at all (ENGINEERING_PRINCIPLES §4).
 */
export interface UnitOfWork {
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
