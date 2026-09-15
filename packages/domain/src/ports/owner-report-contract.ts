/**
 * The owner-report read contract, run against every adapter.
 *
 * Reuses the repository contract's world rather than inventing a third
 * harness: two houses, one basket across both, placed at CLOCK. Every case
 * reads the facts back through the port and asserts the thing the projection
 * depends on — above all that the adapter carries what a payout would carry,
 * because `buildOwnerReport` classifies these rows with the payout's own rule
 * and a missing remittance or snapshot would silently move money between
 * "earned" and "held".
 *
 * Framework-free, like the repository contract: each case throws on failure.
 */
import { Money } from '../value-objects/money';
import { SubOrderLifecycle, type Actor, type ReasonCode, type SubOrderState } from '../state-machines/sub-order';
import { FixedClock } from './clock';
import type { ContractHarness, ContractWorld } from './repository-contract';

export interface OwnerReportContractCase {
  readonly name: string;
  run(setup: ContractHarness): Promise<void>;
}

class ContractViolation extends Error {}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new ContractViolation(message);
};

const equal = <T>(actual: T, expected: T, what: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, received ${a}`);
};

/** The moment the harness places its orders. Every transition here is stamped with it. */
const PLACED = new Date('2026-09-01T21:42:00Z');
const CLOCK = new FixedClock(PLACED);

const THAT_DAY = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T00:00:00Z') };
const NEXT_DAY = { from: new Date('2026-09-02T00:00:00Z'), to: new Date('2026-09-03T00:00:00Z') };

async function placeBasket(w: ContractWorld, reference: string): Promise<string> {
  await w.uow.transaction((r) => r.orders.save(w.makeDraft(reference), w.sellerIdBySlug));
  const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
  const subs = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));
  const sub = subs[subs.length - 1];
  assert(sub !== undefined, 'the basket must have a Ward sub-order');
  return sub!.id;
}

async function walk(
  w: ContractWorld,
  id: string,
  steps: ReadonlyArray<readonly [SubOrderState, Actor, ReasonCode?]>,
): Promise<void> {
  for (const [to, actor, reason] of steps) {
    const current = await w.uow.transaction((r) => r.subOrders.findById(id));
    const record = SubOrderLifecycle.transition(
      current!.state, { to, actor, ...(reason ? { reason } : {}) }, CLOCK,
    );
    await w.uow.transaction((r) => r.subOrders.applyTransition(id, to, actor, reason ?? null, record));
  }
}

async function factFor(w: ContractWorld, id: string, period = THAT_DAY) {
  const facts = await w.uow.transaction((r) => r.ownerReport.facts(period));
  return { facts, sub: facts.subOrders.find((s) => s.id === id) };
}

export const ownerReportContract: readonly OwnerReportContractCase[] = [
  {
    name: 'returns the cohort placed inside the period, and nothing from outside it',
    async run(setup) {
      const w = await setup();
      const id = await placeBasket(w, 'DY-R0001');

      const inside = await factFor(w, id);
      assert(inside.sub !== undefined, 'an order placed that day must be in that day’s facts');
      equal(inside.facts.subOrders.length, 2, 'both houses of the basket');
      equal(inside.sub!.sellerId, w.sellerIdBySlug.get('dar-al-ward')!, 'the house');
      equal(inside.sub!.governorate, 'cairo', 'the governorate the parcel was sent to');
      equal(inside.sub!.placedAt.toISOString(), PLACED.toISOString(), 'placed at');
      assert(inside.sub!.confirmDueAt !== null, 'the confirmation deadline is carried');

      const after = await w.uow.transaction((r) => r.ownerReport.facts(NEXT_DAY));
      equal(after.subOrders.length, 0, 'a later period must not include it');
    },
  },

  {
    name: 'an untouched order carries no answer, no clock beyond confirmation, and no exit',
    async run(setup) {
      const w = await setup();
      const id = await placeBasket(w, 'DY-R0002');
      const { sub } = await factFor(w, id);

      equal(sub!.respondedAt, null, 'answered at');
      equal(sub!.confirmedAt, null, 'confirmed at');
      equal(sub!.dispatchDueAt, null, 'dispatch deadline');
      equal(sub!.dispatchedAt, null, 'dispatched at');
      equal(sub!.exitReason, null, 'exit reason');
      equal(sub!.cashInHand, false, 'cash in hand');
    },
  },

  {
    name: 'confirming is an answer, and starts the dispatch clock',
    async run(setup) {
      const w = await setup();
      const id = await placeBasket(w, 'DY-R0003');
      await walk(w, id, [['awaiting_seller', 'system'], ['confirmed', 'seller']]);
      const { sub } = await factFor(w, id);

      equal(sub!.respondedAt?.toISOString() ?? null, PLACED.toISOString(), 'answered at');
      equal(sub!.confirmedAt?.toISOString() ?? null, PLACED.toISOString(), 'confirmed at');
      // Ward's terms in both harnesses: 48 dispatch hours.
      equal(sub!.dispatchDueAt?.toISOString() ?? null, '2026-09-03T21:42:00.000Z', 'dispatch deadline');
    },
  },

  {
    name: 'declining is ALSO an answer — with its coded reason, and no confirmation',
    async run(setup) {
      /*
       * The SLA measures answering in time. An adapter that only knew about
       * `confirmed_at` would report every prompt decline as unanswered, and the
       * owner would read a house that releases orders it cannot fill as a house
       * that ignores them.
       */
      const w = await setup();
      const id = await placeBasket(w, 'DY-R0004');
      await walk(w, id, [['awaiting_seller', 'system'], ['rejected', 'seller', 'out_of_stock']]);
      const { sub } = await factFor(w, id);

      equal(sub!.state, 'rejected', 'state');
      equal(sub!.respondedAt?.toISOString() ?? null, PLACED.toISOString(), 'answered at');
      equal(sub!.confirmedAt, null, 'a declined order was never confirmed');
      equal(sub!.exitReason, 'out_of_stock', 'exit reason');
    },
  },

  {
    name: 'carries what a PAYOUT needs: delivery, remittance, the rate snapshot and the house’s reserve',
    async run(setup) {
      const w = await setup();
      const draft = w.makeDraft('DY-R0005');
      await w.uow.transaction((r) => r.orders.save(draft, w.sellerIdBySlug));
      const wardId = w.sellerIdBySlug.get('dar-al-ward')!;
      const subs = await w.uow.transaction((r) => r.subOrders.listBySeller(wardId));
      const id = subs[subs.length - 1]!.id;

      await walk(w, id, [
        ['awaiting_seller', 'system'], ['confirmed', 'seller'],
        ['dispatched', 'seller'], ['delivered', 'platform'],
      ]);

      const before = await factFor(w, id);
      equal(before.sub!.cashInHand, false, 'delivered is not the same as paid');

      await w.markRemitted(id);
      const { sub } = await factFor(w, id);

      equal(sub!.cashInHand, true, 'cash in hand once the courier remits');
      equal(sub!.deliveredAt?.toISOString() ?? null, PLACED.toISOString(), 'delivered at');
      equal(sub!.dispatchedAt?.toISOString() ?? null, PLACED.toISOString(), 'dispatched at');

      const wardDraft = draft.subOrders.find((s) => s.sellerId === 'dar-al-ward')!;
      equal(sub!.commissionBps, wardDraft.lineItems[0]!.commission.bps, 'snapshotted rate');
      equal(sub!.commissionSource, wardDraft.lineItems[0]!.commission.source, 'snapshotted source');
      equal(sub!.merchandise.minor, wardDraft.merchandise.minor, 'merchandise');

      // The same reserve a payout for this house would use, read from the house.
      const house = await w.uow.transaction((r) => r.sellers.findById(wardId));
      equal(sub!.reserveDays, house!.payoutReserveDays, 'reserve days');
    },
  },

  {
    name: 'counts support tickets by when they were opened',
    async run(setup) {
      const w = await setup();
      const open = (reference: string, now: Date) => w.uow.transaction((r) => r.support.open({
        reference,
        category: 'other',
        subject: 'سؤال',
        message: 'متى يصل الطلب؟',
        contactName: 'أحمد',
        contactPhone: '01009998877',
        priority: 'p3',
        orderReference: null,
        now,
      }));
      await open('DS-CDFHJKMN', new Date('2026-09-01T10:00:00Z'));
      await open('DS-CDFHJKMP', new Date('2026-09-01T23:00:00Z'));
      await open('DS-CDFHJKMQ', new Date('2026-09-02T09:00:00Z'));

      const facts = await w.uow.transaction((r) => r.ownerReport.facts(THAT_DAY));
      equal(facts.ticketCount, 2, 'tickets opened that day');
    },
  },

  {
    name: 'reports refunds and discounts as amounts — zero when there are none, never absent',
    async run(setup) {
      const w = await setup();
      await placeBasket(w, 'DY-R0007');
      const facts = await w.uow.transaction((r) => r.ownerReport.facts(THAT_DAY));

      assert(facts.platformRefunds instanceof Money, 'refunds must cross the boundary as Money');
      assert(facts.discounts instanceof Money, 'discounts must cross the boundary as Money');
      equal(facts.platformRefunds.minor, 0, 'no refunds yet');
      equal(facts.discounts.minor, 0, 'the harness basket has no discount');
    },
  },
];
