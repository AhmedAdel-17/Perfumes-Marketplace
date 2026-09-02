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
import type { SettlementSubOrder } from '../services/settlement';

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

export interface SellerRepository {
  findById(id: string): Promise<SellerRecord | null>;
  findBySlug(slug: string): Promise<SellerRecord | null>;
}

export interface ProductRepository {
  findBySlug(slug: string): Promise<ProductRecord | null>;
  listPublishedBySeller(sellerId: string): Promise<readonly ProductRecord[]>;
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
}

export interface SubOrderRepository {
  findById(id: string): Promise<SubOrderRecord | null>;
  listBySeller(sellerId: string): Promise<readonly SubOrderRecord[]>;

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
}

/** All ports, handed to a use-case together. */
export interface Repositories {
  readonly sellers: SellerRepository;
  readonly products: ProductRepository;
  readonly orders: OrderRepository;
  readonly subOrders: SubOrderRepository;
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
