import { describe, expect, it } from 'vitest';
import {
  CHANGE_OF_MIND_DAYS, FAULT_REASONS, FAULT_WINDOW_DAYS, RETURN_STATES,
  ReturnLifecycle, isFault, objectionsToRequesting, permittedReasons,
  proposedCostBearer, windowDaysFor,
  type ReturnEligibility, type ReturnReason, type ReturnState,
} from './return-request';
import { RETURN_REASONS } from '../state-machines/sub-order';
import { InvalidTransition } from '../errors/index';

const NOW = new Date('2026-09-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const ask = (overrides: Partial<Parameters<typeof objectionsToRequesting>[0]> = {}) =>
  objectionsToRequesting({
    reason: 'defective',
    eligibility: 'sealed_only',
    deliveredAt: daysAgo(2),
    alreadyRequested: false,
    note: 'البخّاخ لا يعمل',
    now: NOW,
    ...overrides,
  });

describe('what a listing’s policy may and may not refuse', () => {
  it('always permits a FAULT, whatever the listing says', () => {
    /*
     * Egypt's Consumer Protection Law 181/2018 gives a remedy for a good that
     * is defective, damaged or not as described, and no seller policy waives
     * it. A house setting "not returnable" is refusing a change of mind — it is
     * not reserving the right to send somebody a broken bottle.
     */
    for (const eligibility of [
      'sealed_only', 'sealed_or_defect', 'defect_only', 'not_returnable', null,
    ] as (ReturnEligibility | null)[]) {
      for (const reason of FAULT_REASONS) {
        expect(permittedReasons(eligibility), `${eligibility} / ${reason}`)
          .toContain(reason);
      }
    }
  });

  it('permits a change of mind only where the listing allows it', () => {
    // Perfume is a hygiene product: an opened bottle cannot go back into stock,
    // which is what `sealed_only` is actually about.
    expect(permittedReasons('sealed_only')).toContain('changed_mind');
    expect(permittedReasons('sealed_or_defect')).toContain('changed_mind');
    expect(permittedReasons('defect_only')).not.toContain('changed_mind');
    expect(permittedReasons('not_returnable')).not.toContain('changed_mind');
  });

  it('treats a listing with no stated policy as the STRICTEST', () => {
    // Inventing a returns promise on a house's behalf commits somebody else's
    // money. Silence is not consent.
    expect(permittedReasons(null)).not.toContain('changed_mind');
  });

  it('covers every reason the state machine knows', () => {
    // A reason added to RETURN_REASONS and forgotten here would be offered by
    // the machine and refused by this module, or the reverse.
    const all = permittedReasons('sealed_only');
    for (const reason of RETURN_REASONS) expect(all, reason).toContain(reason);
  });
});

describe('the window', () => {
  it('gives a change of mind the statutory fourteen days', () => {
    expect(CHANGE_OF_MIND_DAYS).toBe(14);
    expect(windowDaysFor('changed_mind')).toBe(CHANGE_OF_MIND_DAYS);
  });

  it('gives a fault longer, because a fault shows up later', () => {
    expect(FAULT_WINDOW_DAYS).toBeGreaterThan(CHANGE_OF_MIND_DAYS);
    for (const reason of FAULT_REASONS) {
      expect(windowDaysFor(reason), reason).toBe(FAULT_WINDOW_DAYS);
    }
  });

  it('refuses a request after the window closes', () => {
    expect(ask({ reason: 'changed_mind', deliveredAt: daysAgo(20) }))
      .toContain('window_closed');
    // The same delay is still inside the fault window.
    expect(ask({ reason: 'defective', deliveredAt: daysAgo(20) }))
      .not.toContain('window_closed');
  });

  it('is inclusive of the last day', () => {
    // Somebody asking on the fourteenth day has asked within fourteen days.
    // Off by one here is a refusal a customer will read as a trick.
    expect(ask({ reason: 'changed_mind', deliveredAt: daysAgo(14) }))
      .not.toContain('window_closed');
    expect(ask({ reason: 'changed_mind', deliveredAt: daysAgo(15) }))
      .toContain('window_closed');
  });

  it('says NOT DELIVERED rather than window closed when nothing has arrived', () => {
    // Different next step: the customer waits rather than gives up.
    const objections = ask({ deliveredAt: null });
    expect(objections).toContain('not_delivered');
    expect(objections).not.toContain('window_closed');
  });
});

describe('what else stops a request', () => {
  it('accepts an ordinary one', () => {
    expect(ask()).toEqual([]);
  });

  it('refuses a reason the listing does not permit', () => {
    expect(ask({ reason: 'changed_mind', eligibility: 'not_returnable' }))
      .toContain('reason_not_permitted');
  });

  it('refuses a second request for the same parcel', () => {
    expect(ask({ alreadyRequested: true })).toContain('already_requested');
  });

  it('requires a written note', () => {
    /*
     * The code drives cost allocation and the house's performance record, and
     * a bare code tells a house nothing it can act on — "defective" could be a
     * cracked atomiser or a scent that turned. Somebody has to collect and
     * inspect the bottle; they deserve a sentence saying what to look for.
     */
    expect(ask({ note: '   ' })).toContain('note_required');
  });

  it('reports every objection, not the first', () => {
    const objections = ask({
      reason: 'changed_mind',
      eligibility: 'not_returnable',
      deliveredAt: daysAgo(90),
      note: '',
    });
    expect(objections).toContain('reason_not_permitted');
    expect(objections).toContain('window_closed');
    expect(objections).toContain('note_required');
  });
});

describe('who pays follows from why', () => {
  it('never leaves a cost unowned', () => {
    // Doc 03 §4 makes returns and failed delivery the largest single cost line
    // in this business. A cost that starts at `unallocated` is a cost the
    // platform quietly absorbs.
    for (const reason of RETURN_REASONS) {
      expect(proposedCostBearer(reason as ReturnReason), reason).not.toBe('unallocated');
    }
  });

  it('charges the courier for damage in transit', () => {
    // It left the house intact and arrived broken. Recoverable under carriage.
    expect(proposedCostBearer('damaged_in_transit')).toBe('courier');
  });

  it('charges the house for what the house got wrong', () => {
    for (const reason of ['wrong_item', 'not_as_described', 'defective'] as const) {
      expect(proposedCostBearer(reason), reason).toBe('seller');
    }
  });

  it('charges the customer when nothing went wrong', () => {
    expect(proposedCostBearer('changed_mind')).toBe('customer');
  });

  it('separates fault from preference exactly once', () => {
    for (const reason of RETURN_REASONS) {
      const r = reason as ReturnReason;
      expect(isFault(r), reason).toBe(proposedCostBearer(r) !== 'customer');
    }
  });
});

describe('the return lifecycle', () => {
  it('lets a house or an operator decide, and a customer neither', () => {
    expect(ReturnLifecycle.can('requested', 'approved', 'seller')).toBe(true);
    expect(ReturnLifecycle.can('requested', 'declined', 'platform')).toBe(true);
    // A customer asks. They do not decide.
    expect(ReturnLifecycle.can('requested', 'approved', 'customer')).toBe(false);
    expect(ReturnLifecycle.can('requested', 'declined', 'customer')).toBe(false);
  });

  it('lets a customer withdraw their own request', () => {
    expect(ReturnLifecycle.can('requested', 'closed', 'customer')).toBe(true);
  });

  it('REFUSES to refund anything that has not come back', () => {
    /*
     * The sentence the whole table exists to make true. There is no path from
     * `requested` or `approved` to `refunded`: money moves only after somebody
     * physically had the bottle. Refunding on a promise is how a marketplace
     * funds a fraud ring.
     */
    for (const state of RETURN_STATES) {
      const canRefund = ReturnLifecycle.can(state as ReturnState, 'refunded', 'platform');
      expect(canRefund, `${state} → refunded`).toBe(state === 'received');
    }
    expect(ReturnLifecycle.canRefund('received')).toBe(true);
    expect(ReturnLifecycle.canRefund('approved')).toBe(false);
  });

  it('throws on an illegal move rather than returning false', () => {
    // An illegal move reaching this point is a bug, and a silent `false` is a
    // bug that carries on.
    expect(() => ReturnLifecycle.assert('requested', 'refunded', 'platform'))
      .toThrow(InvalidTransition);
    expect(() => ReturnLifecycle.assert('requested', 'approved', 'seller')).not.toThrow();
  });

  it('names the RETURN in the error, not the sub-order', () => {
    // The shared error defaults its subject to `sub-order`, which was written
    // when there was only one state machine. A second machine using the default
    // reports the wrong noun to whoever reads the log.
    try {
      ReturnLifecycle.assert('closed', 'approved', 'platform');
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as InvalidTransition).subject).toBe('return');
    }
  });

  it('ends at closed, and nothing follows', () => {
    expect(ReturnLifecycle.isTerminal('closed')).toBe(true);
    for (const state of RETURN_STATES.filter((s) => s !== 'closed')) {
      expect(ReturnLifecycle.isTerminal(state as ReturnState), state).toBe(false);
    }
    for (const state of RETURN_STATES) {
      expect(ReturnLifecycle.can('closed', state as ReturnState, 'platform'), state).toBe(false);
    }
  });

  it('every state is reachable from requested', () => {
    // A state in the enum that nothing can reach is a state the console will
    // never show and somebody will eventually write to by hand.
    const reached = new Set<ReturnState>(['requested']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const state of [...reached]) {
        for (const next of RETURN_STATES) {
          const possible = (['customer', 'seller', 'platform', 'courier'] as const)
            .some((actor) => ReturnLifecycle.can(state, next as ReturnState, actor));
          if (possible && !reached.has(next as ReturnState)) {
            reached.add(next as ReturnState);
            grew = true;
          }
        }
      }
    }
    expect([...RETURN_STATES].filter((s) => !reached.has(s as ReturnState))).toEqual([]);
  });
});
