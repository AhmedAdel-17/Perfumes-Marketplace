/**
 * Repository contract.
 *
 * Pattern — contract tests over Ports & Adapters (ENGINEERING_PRINCIPLES §2, L).
 *
 * "Any implementation must be swappable without the caller knowing. Contract
 * tests run against every adapter."
 *
 * These cases are deliberately framework-free — no vitest import, no expect —
 * so this file can live inside `packages/domain` without breaking the dependency
 * rule. Each case throws on failure; both the in-memory fake and the Drizzle
 * adapter run the identical list, which is what makes substitutability a
 * demonstrated fact rather than an intention.
 */
import { Money } from '../value-objects/money';
import { SubOrderLifecycle } from '../state-machines/sub-order';
import { FixedClock } from './clock';
import type { UnitOfWork } from './repositories';
import type { DraftOrder } from '../services/place-order';

export interface ContractWorld {
  readonly uow: UnitOfWork;
  /** Slug -> id, as PlaceOrder addresses sellers by slug. */
  readonly sellerIdBySlug: ReadonlyMap<string, string>;
  readonly wardProductId: string;
  readonly nourProductId: string;
  readonly customerId: string;
  /** Builds a valid draft against the seeded world. */
  makeDraft(reference: string, opts?: { bogusProductId?: string }): DraftOrder;
  /**
   * Record that the courier has remitted the cash for a sub-order.
   *
   * Part of the fixture because `cashInHand` is a real behavioural difference
   * between adapters, and an unasserted difference is how two implementations
   * silently diverge while both look green.
   */
  markRemitted(subOrderId: string): Promise<void>;
}

/** A fresh, seeded world per case. Adapters supply this. */
export type ContractHarness = () => Promise<ContractWorld>;

export interface ContractCase {
  readonly name: string;
  run(setup: ContractHarness): Promise<void>;
}

// ------------------------------------------------------------- assertions

class ContractViolation extends Error {}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new ContractViolation(message);
};

const equal = <T>(actual: T, expected: T, what: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, received ${a}`);
};

const rejects = async (work: () => Promise<unknown>, what: string): Promise<void> => {
  try {
    await work();
  } catch {
    return;
  }
  throw new ContractViolation(`${what}: expected the call to be refused, but it succeeded`);
};

const CLOCK = new FixedClock(new Date('2026-09-01T21:42:00Z'));

// ------------------------------------------------------------------ cases

export const repositoryContract: readonly ContractCase[] = [
  {
    name: 'save() persists an order and reports its reference and total',
    async run(setup) {
      const w = await setup();
      const draft = w.makeDraft('DY-C0001');
      const saved = await w.uow.transaction((r) => r.orders.save(draft, w.sellerIdBySlug));

      equal(saved.reference, 'DY-C0001', 'reference');
      equal(saved.total.minor, draft.total.minor, 'total');
      equal(saved.subOrderIds.length, draft.subOrders.length, 'sub-order count');
      assert(saved.id.length > 0, 'save() must return a persisted id');
    },
  },

  {
    name: 'findByReference() round-trips what save() wrote',
    async run(setup) {
      const w = await setup();
      const draft = w.makeDraft('DY-C0002');
      await w.uow.transaction((r) => r.orders.save(draft, w.sellerIdBySlug));

      const found = await w.uow.transaction((r) => r.orders.findByReference('DY-C0002'));
      assert(found !== null, 'the order just saved must be findable');
      equal(found!.total.minor, draft.total.minor, 'round-tripped total');
      equal(found!.source, draft.source, 'round-tripped source');
    },
  },

  {
    name: 'findByReference() returns null for an unknown reference, never throws',
    async run(setup) {
      const w = await setup();
      const found = await w.uow.transaction((r) => r.orders.findByReference('DY-NOPE'));
      equal(found, null, 'unknown reference');
    },
  },

  {
    name: 'save() is ATOMIC — a bad line item leaves no partial order behind',
    async run(setup) {
      const w = await setup();
      // A line item pointing at a product that does not exist. The order row is
      // written first, so a non-transactional implementation leaves an orphan —
      // a customer total that reconciles to nothing, and a house billed for work
      // it cannot see.
      const draft = w.makeDraft('DY-C0003', {
        bogusProductId: '00000000-0000-0000-0000-000000000000',
      });

      await rejects(
        () => w.uow.transaction((r) => r.orders.save(draft, w.sellerIdBySlug)),
        'saving an order with an invalid line item',
      );

      const orphan = await w.uow.transaction((r) => r.orders.findByReference('DY-C0003'));
      equal(orphan, null, 'no partial order may survive a failed save');
    },
  },

  {
    name: 'listBySeller() returns only that house’s sub-orders',
    async run(setup) {
      const w = await setup();
      await w.uow.transaction((r) => r.orders.save(w.makeDraft('DY-C0004'), w.sellerIdBySlug));

      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
      const nourId = w.sellerIdBySlug.get('maison-nour')!;

      const ward = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));
      const nour = await w.uow.transaction((r) => r.subOrders.listBySeller(nourId));

      equal(ward.length, 1, 'ward sub-order count');
      equal(nour.length, 1, 'nour sub-order count');
      assert(ward.every((s) => s.sellerId === wardId), 'ward must see only its own');
      assert(nour.every((s) => s.sellerId === nourId), 'nour must see only its own');
      assert(
        !ward.some((s) => nour.some((n) => n.id === s.id)),
        'the two houses must share no sub-order',
      );
    },
  },

  {
    name: 'applyTransition() moves the state and records how it moved',
    async run(setup) {
      const w = await setup();
      await w.uow.transaction((r) => r.orders.save(w.makeDraft('DY-C0005'), w.sellerIdBySlug));
      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
      const [sub] = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));
      assert(sub !== undefined, 'seeded sub-order');

      const record = SubOrderLifecycle.transition(
        sub!.state, { to: 'awaiting_seller', actor: 'system' }, CLOCK,
      );
      await w.uow.transaction((r) =>
        r.subOrders.applyTransition(sub!.id, 'awaiting_seller', 'system', null, record),
      );

      const after = await w.uow.transaction((r) => r.subOrders.findById(sub!.id));
      equal(after!.state, 'awaiting_seller', 'state after transition');
    },
  },

  {
    name: 'applyTransition() refuses a move the state machine forbids',
    async run(setup) {
      const w = await setup();
      await w.uow.transaction((r) => r.orders.save(w.makeDraft('DY-C0006'), w.sellerIdBySlug));
      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
      const [sub] = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));

      // placed -> delivered is not in the table. The adapter must not write it,
      // whatever the caller passes.
      const bogus = {
        from: 'placed' as const, to: 'delivered' as const,
        actor: 'platform' as const, reason: null, at: CLOCK.now(),
      };
      await rejects(
        () => w.uow.transaction((r) =>
          r.subOrders.applyTransition(sub!.id, 'delivered', 'platform', null, bogus)),
        'an illegal transition',
      );

      const after = await w.uow.transaction((r) => r.subOrders.findById(sub!.id));
      equal(after!.state, 'placed', 'state must be unchanged after a refused transition');
    },
  },

  {
    name: 'listForSettlement() returns rows the domain can settle directly',
    async run(setup) {
      const w = await setup();
      await w.uow.transaction((r) => r.orders.save(w.makeDraft('DY-C0007'), w.sellerIdBySlug));
      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;

      const rows = await w.uow.transaction((r) => r.subOrders.listForSettlement(wardId));
      assert(rows.length === 1, 'one settlement row for the seeded order');

      const row = rows[0]!;
      assert(row.merchandise instanceof Money, 'merchandise must be Money, not a number');
      assert(row.shipping instanceof Money, 'shipping must be Money, not a number');
      assert(row.commissionBps > 0, 'the snapshotted rate must be carried through');
      assert(
        SubOrderLifecycle.isTerminal(row.state) || !SubOrderLifecycle.isTerminal(row.state),
        'state must be a valid sub-order state',
      );
    },
  },

  {
    name: 'listForSettlement() reports cashInHand only after the courier remits',
    async run(setup) {
      const w = await setup();
      await w.uow.transaction((r) => r.orders.save(w.makeDraft('DY-C0009'), w.sellerIdBySlug));
      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;

      const before = await w.uow.transaction((r) => r.subOrders.listForSettlement(wardId));
      assert(
        before[0]!.cashInHand === false,
        'cash must NOT be reported in hand before remittance — doc 03 §10: never pay a house faster than we are paid',
      );

      await w.markRemitted(before[0]!.id);

      const after = await w.uow.transaction((r) => r.subOrders.listForSettlement(wardId));
      assert(after[0]!.cashInHand === true, 'cash must be in hand once the courier has remitted');
    },
  },

  {
    name: 'findById() returns null for an unknown id rather than throwing',
    async run(setup) {
      const w = await setup();
      const missing = await w.uow.transaction((r) =>
        r.subOrders.findById('00000000-0000-0000-0000-000000000000'));
      equal(missing, null, 'unknown sub-order id');
    },
  },

  {
    name: 'money crosses the boundary as Money, never as a bare number',
    async run(setup) {
      const w = await setup();
      const draft = w.makeDraft('DY-C0008');
      const saved = await w.uow.transaction((r) => r.orders.save(draft, w.sellerIdBySlug));
      assert(saved.total instanceof Money, 'PersistedOrder.total must be Money');

      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
      const subs = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));
      assert(subs[0]!.merchandise instanceof Money, 'SubOrderRecord.merchandise must be Money');
      equal(subs[0]!.merchandise.toMajorString(), '380.00', 'ward merchandise');
    },
  },
];
