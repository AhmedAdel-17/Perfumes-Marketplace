import { describe, expect, it } from 'vitest';
import { BROWSING_EVENTS } from './browsing-events';
import { buildPreOrderFunnel } from './pre-order-funnel';

describe('the pre-order funnel', () => {
  it('reports every stage, in the order a visitor meets them', () => {
    const funnel = buildPreOrderFunnel([{ name: 'product_view', events: 3, visitors: 2 }]);
    expect(funnel.stages.map((s) => s.event)).toEqual([...BROWSING_EVENTS]);
  });

  it('turns a stage nobody reached into a zero, not a gap', () => {
    // The repository omits names it saw nothing for; a funnel missing a stage is
    // unreadable, and a genuine zero is the most interesting thing on the screen.
    const funnel = buildPreOrderFunnel([{ name: 'landing_view', events: 40, visitors: 31 }]);
    const cartAdd = funnel.stages.find((s) => s.event === 'cart_add');
    expect(cartAdd).toEqual({ event: 'cart_add', events: 0, visitors: 0 });
  });

  it('keeps events and visitors apart', () => {
    // One person refreshing twenty times is one visitor who looked, and a rate
    // built on events would call them twenty people who did not buy.
    const funnel = buildPreOrderFunnel([{ name: 'product_view', events: 20, visitors: 1 }]);
    const view = funnel.stages.find((s) => s.event === 'product_view');
    expect([view?.events, view?.visitors]).toEqual([20, 1]);
  });

  it('is empty only when nothing at all was recorded', () => {
    expect(buildPreOrderFunnel([]).isEmpty).toBe(true);
    expect(buildPreOrderFunnel([{ name: 'search', events: 0, visitors: 0 }]).isEmpty).toBe(true);
    expect(buildPreOrderFunnel([{ name: 'search', events: 1, visitors: 1 }]).isEmpty).toBe(false);
  });

  it('ignores a name the vocabulary does not contain', () => {
    // The database refuses to store one, but a projection that trusted its input
    // would put a stage on the owner's screen that no code fires.
    const funnel = buildPreOrderFunnel([
      { name: 'product_view', events: 2, visitors: 2 },
      { name: 'wishlist_add' as 'search', events: 99, visitors: 99 },
    ]);
    expect(funnel.stages).toHaveLength(BROWSING_EVENTS.length);
    expect(funnel.stages.find((s) => s.event === 'search')?.events).toBe(0);
  });
});
