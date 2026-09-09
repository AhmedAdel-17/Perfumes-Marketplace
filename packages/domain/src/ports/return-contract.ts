/**
 * Return repository contract.
 *
 * Run against the in-memory fake and the Drizzle adapter. It shares the review
 * contract's world — the same two delivered orders — because a return and a
 * review are the same authorisation problem with different consequences, and
 * building the fixture twice would let the two drift.
 *
 * The cases here are the ones where the two implementations could plausibly
 * disagree: what a repository returns UNJUDGED, whose parcel a line item
 * belongs to, and whether a state move is conditional on the state the caller
 * decided against.
 */
import type { UnitOfWork } from './repositories';
import type { ContractOrder } from './review-contract';

export interface ReturnContractWorld {
  readonly uow: UnitOfWork;
  /** Delivered, on two different phones. */
  readonly first: ContractOrder;
  readonly second: ContractOrder;
  /** Placed, not delivered. */
  readonly undelivered: ContractOrder;
  /** A platform staff id a decision can be attributed to. */
  readonly moderatorId: string;
  /** The house that packed the FIRST order's first line. */
  readonly firstSellerId: string;
}

export type ReturnHarness = () => Promise<ReturnContractWorld>;

export interface ReturnContractCase {
  readonly name: string;
  run(setup: ReturnHarness): Promise<void>;
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

const NOW = new Date('2026-09-08T10:00:00.000Z');

export const returnContract: readonly ReturnContractCase[] = [
  {
    name: 'a delivered line reports the FACTS a return depends on, unjudged',
    async run(setup) {
      const { uow, first } = await setup();
      const lines = await uow.transaction((r) => r.returns.listReturnable(first));

      assert(lines.length > 0, 'a delivered order must offer lines');
      const line = lines[0]!;
      assert(line.deliveredAt !== null, 'the delivery date drives the window');
      assert(line.productName.length > 0, 'the perfume must be named');
      assert(line.subOrderReference.length > 0, 'the parcel must be named');
      equal(line.alreadyRequested, false, 'a fresh line');
      /*
       * No `canReturn` field, on purpose. The window and the listing policy are
       * decided by the domain from these facts; a repository that answered the
       * question would be a second place where fourteen days is defined, and
       * the first one to be wrong when the law changes.
       */
      assert(!('canReturn' in line), 'the repository must not rule on eligibility');
    },
  },

  {
    name: 'an order that has not arrived reports no delivery date',
    async run(setup) {
      const { uow, undelivered } = await setup();
      const lines = await uow.transaction((r) => r.returns.listReturnable(undelivered));
      // Listed, unlike reviews: "not arrived yet" is a different answer from
      // "not yours", and the screen should say which.
      for (const line of lines) {
        equal(line.deliveredAt, null, 'the delivery date of an undelivered parcel');
      }
    },
  },

  {
    name: 'the WRONG PHONE reveals nothing',
    async run(setup) {
      const { uow, first, second } = await setup();
      equal(
        await uow.transaction((r) => r.returns.listReturnable({
          reference: first.reference, phone: second.phone,
        })),
        [],
        'returnable lines for a mismatched phone',
      );
    },
  },

  {
    name: 'a request is recorded against the parcel the line belongs to',
    async run(setup) {
      const { uow, first } = await setup();
      const [line] = await uow.transaction((r) => r.returns.listReturnable(first));

      const asked = await uow.transaction((r) => r.returns.request({
        ...first, lineItemId: line!.lineItemId,
        reason: 'defective', note: 'البخّاخ لا يعمل',
        costBearer: 'seller', now: NOW,
      }));
      assert(asked !== null, 'requesting a return for a delivered purchase');

      const [record] = await uow.transaction((r) => r.returns.listForOrder(first));
      assert(record !== undefined, 'the customer must see what they asked for');
      // Derived by the database from the line item, never sent by the caller.
      equal(record!.subOrderId, line!.subOrderId, 'the parcel');
      equal(record!.state, 'requested', 'the starting state');
      equal(record!.reason, 'defective', 'the reason');
      equal(record!.customerNote, 'البخّاخ لا يعمل', 'the note');
      equal(record!.costBearer, 'seller', 'the proposed cost bearer');
    },
  },

  {
    name: 'ANOTHER ORDER’S line cannot be returned with these factors',
    async run(setup) {
      const { uow, first, second } = await setup();
      const [theirs] = await uow.transaction((r) => r.returns.listReturnable(second));

      equal(
        await uow.transaction((r) => r.returns.request({
          ...first, lineItemId: theirs!.lineItemId,
          reason: 'changed_mind', note: 'لم يعجبني',
          costBearer: 'customer', now: NOW,
        })),
        null,
        'returning a stranger’s purchase',
      );
      equal((await uow.transaction((r) => r.returns.listForOrder(second))).length, 0,
        'returns on the other order');
    },
  },

  {
    name: 'the same line cannot be requested twice',
    async run(setup) {
      const { uow, first } = await setup();
      const [line] = await uow.transaction((r) => r.returns.listReturnable(first));
      const ask = () => uow.transaction((r) => r.returns.request({
        ...first, lineItemId: line!.lineItemId,
        reason: 'defective', note: 'عيب', costBearer: 'seller', now: NOW,
      }));

      assert(await ask() !== null, 'the first request');
      equal(await ask(), null, 'a second request for one bottle');

      const after = await uow.transaction((r) => r.returns.listReturnable(first));
      equal(after.find((l) => l.lineItemId === line!.lineItemId)!.alreadyRequested, true,
        'the line after a request');
    },
  },

  {
    name: 'a house sees its OWN returns and no others',
    async run(setup) {
      const { uow, first, second, firstSellerId } = await setup();
      const [mine] = await uow.transaction((r) => r.returns.listReturnable(first));
      const [theirs] = await uow.transaction((r) => r.returns.listReturnable(second));

      await uow.transaction((r) => r.returns.request({
        ...first, lineItemId: mine!.lineItemId,
        reason: 'defective', note: 'عيب', costBearer: 'seller', now: NOW,
      }));
      await uow.transaction((r) => r.returns.request({
        ...second, lineItemId: theirs!.lineItemId,
        reason: 'wrong_item', note: 'منتج مختلف', costBearer: 'seller', now: NOW,
      }));

      const queue = await uow.transaction((r) => r.returns.listForSeller(firstSellerId));
      assert(queue.length > 0, 'the house must see its own');
      for (const row of queue) {
        equal(row.sellerId, firstSellerId, 'a return in the wrong house’s queue');
      }
    },
  },

  {
    name: 'a move is CONDITIONAL on the state it was decided against',
    async run(setup) {
      const { uow, first, moderatorId } = await setup();
      const [line] = await uow.transaction((r) => r.returns.listReturnable(first));
      const asked = await uow.transaction((r) => r.returns.request({
        ...first, lineItemId: line!.lineItemId,
        reason: 'defective', note: 'عيب', costBearer: 'seller', now: NOW,
      }));

      equal(await uow.transaction((r) => r.returns.move({
        id: asked!.id, expectedFrom: 'requested', to: 'approved',
        decidedBy: moderatorId, now: NOW,
      })), true, 'approving a requested return');

      /*
       * The same click again, from a stale screen. Two operators deciding at
       * once must not both succeed, and a repository that wrote unconditionally
       * would let the second overwrite the first's decision without either
       * knowing.
       */
      equal(await uow.transaction((r) => r.returns.move({
        id: asked!.id, expectedFrom: 'requested', to: 'declined',
        decidedBy: moderatorId, now: NOW,
      })), false, 'a decision taken against a stale state');

      equal((await uow.transaction((r) => r.returns.findById(asked!.id)))!.state,
        'approved', 'the state after the stale decision');
    },
  },

  {
    name: 'a refund is recorded as an amount, on the return that earned it',
    async run(setup) {
      const { uow, first, moderatorId } = await setup();
      const [line] = await uow.transaction((r) => r.returns.listReturnable(first));
      const asked = await uow.transaction((r) => r.returns.request({
        ...first, lineItemId: line!.lineItemId,
        reason: 'defective', note: 'عيب', costBearer: 'seller', now: NOW,
      }));

      for (const [from, to] of [
        ['requested', 'approved'], ['approved', 'in_transit'], ['in_transit', 'received'],
      ] as const) {
        equal(await uow.transaction((r) => r.returns.move({
          id: asked!.id, expectedFrom: from, to, decidedBy: moderatorId, now: NOW,
        })), true, `${from} → ${to}`);
      }

      equal(await uow.transaction((r) => r.returns.move({
        id: asked!.id, expectedFrom: 'received', to: 'refunded',
        decidedBy: moderatorId, refundPiastres: 45_000, costBearer: 'seller', now: NOW,
      })), true, 'refunding a received return');

      const row = await uow.transaction((r) => r.returns.findById(asked!.id));
      equal(row!.state, 'refunded', 'the state');
      // Money crosses the boundary as Money. A bare number would let a caller
      // do float arithmetic on a refund.
      equal(row!.refund?.minor, 45_000, 'the refund');
    },
  },

  {
    name: 'moving something that does not exist changes nothing',
    async run(setup) {
      const { uow, moderatorId } = await setup();
      equal(await uow.transaction((r) => r.returns.move({
        id: '00000000-0000-4000-8000-000000000000',
        expectedFrom: 'requested', to: 'approved', decidedBy: moderatorId, now: NOW,
      })), false, 'moving a return that does not exist');
    },
  },
];
