import { describe, expect, it } from 'vitest';
import {
  SUB_ORDER_STATES,
  SubOrderLifecycle,
  TRANSITIONS,
  type Actor,
  type SubOrderState,
} from './sub-order';
import { FixedClock } from '../ports/clock';
import { InvalidTransition, ReasonCodeRequired, UnauthorisedActor } from '../errors/index';

const clock = () => new FixedClock(new Date('2026-09-01T21:42:00Z'));

describe('sub-order — the happy path', () => {
  it('runs placed → awaiting_seller → confirmed → dispatched → delivered', () => {
    const c = clock();
    let state: SubOrderState = 'placed';
    const path: Array<[SubOrderState, Actor]> = [
      ['awaiting_seller', 'system'],
      ['confirmed', 'seller'],
      ['dispatched', 'seller'],
      ['delivered', 'courier'],
    ];
    for (const [to, actor] of path) {
      const rec = SubOrderLifecycle.transition(state, { to, actor }, c);
      expect(rec.from).toBe(state);
      expect(rec.to).toBe(to);
      expect(rec.at.toISOString()).toBe('2026-09-01T21:42:00.000Z');
      state = to;
    }
    expect(state).toBe('delivered');
  });
});

describe('sub-order — the dispatch clock starts at confirmation', () => {
  /*
   * `dispatch_due_at` existed from the first migration and nothing computed it,
   * so no house was ever shown how long it had to ship. The deadline is the
   * confirmation plus the house's dispatch hours as SNAPSHOTTED at placement —
   * one rule, stated here, used by both adapters.
   */
  it('is the confirmation time plus the snapshotted hours', () => {
    const due = SubOrderLifecycle.dispatchDueAt(new Date('2026-09-10T08:00:00Z'), 30);
    expect(due.toISOString()).toBe('2026-09-11T14:00:00.000Z');
  });

  it('does not depend on when the order was placed', () => {
    // A house that confirms early gets its full window; a house that confirms
    // late does not get a shorter one. Both start from their own confirmation.
    const early = SubOrderLifecycle.dispatchDueAt(new Date('2026-09-10T08:00:00Z'), 48);
    const late = SubOrderLifecycle.dispatchDueAt(new Date('2026-09-10T20:00:00Z'), 48);
    expect(late.getTime() - early.getTime()).toBe(12 * 3_600_000);
  });

  it('refuses a window that is not a positive whole number of hours', () => {
    // The database refuses zero too (0020); refusing here means the domain
    // never produces a deadline equal to, or before, its own confirmation.
    for (const hours of [0, -4, 1.5, Number.NaN]) {
      expect(() => SubOrderLifecycle.dispatchDueAt(new Date('2026-09-10T08:00:00Z'), hours))
        .toThrow();
    }
  });
});

describe('sub-order — illegal moves are refused, not ignored', () => {
  it('cannot skip seller confirmation', () => {
    expect(() =>
      SubOrderLifecycle.transition('awaiting_seller', { to: 'dispatched', actor: 'seller' }, clock()),
    ).toThrow(InvalidTransition);
  });

  it('cannot deliver an order that was never dispatched', () => {
    expect(() =>
      SubOrderLifecycle.transition('confirmed', { to: 'delivered', actor: 'courier' }, clock()),
    ).toThrow(InvalidTransition);
  });

  it('cannot move out of a terminal state', () => {
    for (const terminal of ['rejected', 'cancelled', 'refused', 'returned'] as const) {
      expect(SubOrderLifecycle.allowedFrom(terminal)).toEqual([]);
      expect(SubOrderLifecycle.isTerminal(terminal)).toBe(true);
    }
  });

  it('cannot reverse a delivery back into transit', () => {
    expect(() =>
      SubOrderLifecycle.transition('delivered', { to: 'dispatched', actor: 'seller' }, clock()),
    ).toThrow(InvalidTransition);
  });
});

describe('sub-order — actor authority', () => {
  it('a customer cannot confirm on the house behalf', () => {
    expect(() =>
      SubOrderLifecycle.transition('awaiting_seller', { to: 'confirmed', actor: 'customer' }, clock()),
    ).toThrow(UnauthorisedActor);
  });

  it('a seller cannot mark its own order delivered', () => {
    expect(() =>
      SubOrderLifecycle.transition('dispatched', { to: 'delivered', actor: 'seller' }, clock()),
    ).toThrow(UnauthorisedActor);
  });

  it('a seller cannot decline on the customer behalf once dispatched', () => {
    expect(() =>
      SubOrderLifecycle.transition(
        'dispatched',
        { to: 'refused', actor: 'seller', reason: 'customer_refused' },
        clock(),
      ),
    ).toThrow(UnauthorisedActor);
  });
});

describe('sub-order — reason codes (doc 06 §7: no generic reasons)', () => {
  it('declining requires a coded reason', () => {
    expect(() =>
      SubOrderLifecycle.transition('awaiting_seller', { to: 'rejected', actor: 'seller' }, clock()),
    ).toThrow(ReasonCodeRequired);
  });

  it('accepts a reason from the correct vocabulary', () => {
    const rec = SubOrderLifecycle.transition(
      'awaiting_seller',
      { to: 'rejected', actor: 'seller', reason: 'out_of_stock' },
      clock(),
    );
    expect(rec.reason).toBe('out_of_stock');
  });

  it('rejects a reason borrowed from another vocabulary', () => {
    expect(() =>
      SubOrderLifecycle.transition(
        'awaiting_seller',
        { to: 'rejected', actor: 'seller', reason: 'damaged_in_transit' },
        clock(),
      ),
    ).toThrow(ReasonCodeRequired);
  });

  it('refusal and return both demand a reason', () => {
    expect(() =>
      SubOrderLifecycle.transition('dispatched', { to: 'refused', actor: 'courier' }, clock()),
    ).toThrow(ReasonCodeRequired);
    expect(() =>
      SubOrderLifecycle.transition('delivered', { to: 'returned', actor: 'customer' }, clock()),
    ).toThrow(ReasonCodeRequired);
  });

  it('the happy path needs no reason', () => {
    const rec = SubOrderLifecycle.transition(
      'awaiting_seller',
      { to: 'confirmed', actor: 'seller' },
      clock(),
    );
    expect(rec.reason).toBeNull();
  });
});

describe('sub-order — acceptance gates', () => {
  it('gate 5: only a delivered sub-order can produce a review', () => {
    for (const s of SUB_ORDER_STATES) {
      expect(SubOrderLifecycle.canProduceReview(s)).toBe(s === 'delivered');
    }
  });

  it('doc 03 §8: only a completed sub-order attracts commission', () => {
    expect(SubOrderLifecycle.attractsCommission('delivered')).toBe(true);
    for (const s of ['placed', 'awaiting_seller', 'confirmed', 'dispatched', 'rejected', 'cancelled', 'refused', 'returned'] as const) {
      expect(SubOrderLifecycle.attractsCommission(s)).toBe(false);
    }
  });

  it('a return removes the completed status, so the fee reverses', () => {
    expect(SubOrderLifecycle.attractsCommission('delivered')).toBe(true);
    const rec = SubOrderLifecycle.transition(
      'delivered',
      { to: 'returned', actor: 'customer', reason: 'damaged_in_transit' },
      clock(),
    );
    expect(SubOrderLifecycle.attractsCommission(rec.to)).toBe(false);
  });
});

describe('sub-order — the table itself', () => {
  it('every state in the table is a declared state', () => {
    for (const t of TRANSITIONS) {
      expect(SUB_ORDER_STATES).toContain(t.from);
      expect(SUB_ORDER_STATES).toContain(t.to);
    }
  });

  it('has no duplicate from→to pairs', () => {
    const pairs = TRANSITIONS.map((t) => `${t.from}→${t.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('every non-terminal state except delivered can still move somewhere', () => {
    for (const s of SUB_ORDER_STATES) {
      if (SubOrderLifecycle.isTerminal(s)) continue;
      expect(SubOrderLifecycle.allowedFrom(s).length).toBeGreaterThan(0);
    }
  });

  it('every state is reachable from placed', () => {
    const seen = new Set<SubOrderState>(['placed']);
    const queue: SubOrderState[] = ['placed'];
    while (queue.length) {
      for (const next of SubOrderLifecycle.allowedFrom(queue.shift()!)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...SUB_ORDER_STATES].sort());
  });

  it('exhaustive sweep: only table entries are permitted', () => {
    const c = clock();
    for (const from of SUB_ORDER_STATES) {
      for (const to of SUB_ORDER_STATES) {
        const legal = SubOrderLifecycle.rule(from, to) !== undefined;
        let threwInvalid = false;
        try {
          // supply the widest actor/reason set so only the table can refuse
          SubOrderLifecycle.transition(
            from,
            { to, actor: 'platform', reason: 'out_of_stock' },
            c,
          );
        } catch (e) {
          threwInvalid = e instanceof InvalidTransition;
        }
        expect(threwInvalid).toBe(!legal);
      }
    }
  });
});
