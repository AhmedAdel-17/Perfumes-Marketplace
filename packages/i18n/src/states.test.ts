import { describe, expect, it } from 'vitest';
import { CUSTOMER_JOURNEY, journeyIndex, stateCopy, SUB_ORDER_STATE_AR } from './states';
import { SUB_ORDER_STATES } from '@diyar/domain';

describe('customer-facing state copy', () => {
  it('covers every state the machine can reach', () => {
    // A state with no copy would render the raw enum value to a customer —
    // "awaiting_seller" in the middle of an Arabic page.
    for (const state of SUB_ORDER_STATES) {
      expect(SUB_ORDER_STATE_AR[state], state).toBeDefined();
    }
  });

  it('never shows the customer an internal enum value', () => {
    for (const state of SUB_ORDER_STATES) {
      const copy = stateCopy(state);
      expect(copy.label, state).not.toMatch(/[a-z_]{4,}/);
      expect(copy.detail, state).not.toContain(state);
    }
  });

  it('falls back rather than rendering nothing for an unknown state', () => {
    const copy = stateCopy('some_future_state');
    expect(copy.label).toBeTruthy();
    expect(copy.terminal).toBe(false);
  });

  it('keeps exceptions off the progress line', () => {
    // An order a house declined has not progressed three quarters of the way
    // to delivery, and drawing it that way is a lie in a progress bar.
    for (const exception of ['rejected', 'cancelled', 'refused', 'returned']) {
      expect(journeyIndex(exception), exception).toBeNull();
      expect(stateCopy(exception).terminal, exception).toBe(true);
    }
  });

  it('orders the journey the way the state machine actually moves', () => {
    expect(CUSTOMER_JOURNEY[0]).toBe('placed');
    expect(CUSTOMER_JOURNEY.at(-1)).toBe('delivered');
    expect(journeyIndex('confirmed')).toBeLessThan(journeyIndex('dispatched')!);
  });
});
