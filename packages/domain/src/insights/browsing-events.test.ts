import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ID_PATTERN, BROWSING_EVENTS, isBrowsingEvent, newAnonymousId,
  objectionsToRecording, type BrowsingEventDraft,
} from './browsing-events';

/** Deterministic "randomness", as every id generator here takes. */
const bytes = (fill: number) => (count: number) => new Uint8Array(count).fill(fill);

const draft = (over: Partial<BrowsingEventDraft> = {}): BrowsingEventDraft => ({
  name: 'product_view',
  anonymousId: 'a1b2c3d4e5f6a7b8c9d0e1f2',
  ...over,
});

describe('the events this site records', () => {
  it('is the pre-order half of doc 04 §6, and nothing the site cannot honestly fire', () => {
    expect([...BROWSING_EVENTS]).toEqual([
      'landing_view', 'storefront_view', 'search', 'filter_apply', 'scent_map_view',
      'product_view', 'reveal_open', 'dial_turn', 'cart_add', 'checkout_start',
    ]);
  });

  it.each([
    ['payment_select', 'there is one payment method, so the event records no choice'],
    ['wishlist_add', 'the feature does not exist'],
    ['delivered', 'a post-order event: the order graph is where that is measured'],
    ['order_place', 'likewise — and that one is money'],
  ])('refuses %s (%s)', (name) => {
    expect(isBrowsingEvent(name)).toBe(false);
    expect(objectionsToRecording(draft({ name })).map((o) => o)).toContain('unknown_event');
  });

  it('accepts every name it declares', () => {
    for (const name of BROWSING_EVENTS) {
      expect(objectionsToRecording(draft({ name }))).toEqual([]);
    }
  });
});

describe('the anonymous id', () => {
  it('is 24 hex characters from 12 injected bytes', () => {
    const id = newAnonymousId(bytes(0xab));
    expect(id).toBe('ab'.repeat(12));
    expect(ANONYMOUS_ID_PATTERN.test(id)).toBe(true);
  });

  it('pads a byte below 0x10, so the id is never 23 characters', () => {
    // A `toString(16)` without the pad produces "a" for 0x0a, and an id one
    // character short is refused by the database's CHECK — a defect that would
    // appear for roughly one visitor in twenty.
    expect(newAnonymousId(bytes(0x0a))).toBe('0a'.repeat(12));
  });

  it.each([
    ['', 'empty'],
    ['A1B2C3D4E5F6A7B8C9D0E1F2', 'upper case — the CHECK is lower case'],
    ['a1b2c3d4e5f6a7b8c9d0e1f', '23 characters'],
    ['a1b2c3d4e5f6a7b8c9d0e1f23', '25 characters'],
    ['ahmed@example.com', 'an email address, which is the thing this must never be'],
    ['01001234567', 'a phone number, likewise'],
  ])('refuses %s (%s)', (id) => {
    expect(objectionsToRecording(draft({ anonymousId: id })).map((o) => o))
      .toContain('bad_anonymous_id');
  });
});

describe('what an event may carry', () => {
  it('reports every objection at once, not the first', () => {
    expect(objectionsToRecording({ name: 'wishlist_add', anonymousId: 'nope' }).sort())
      .toEqual(['bad_anonymous_id', 'unknown_event']);
  });

  it('keeps the perfume and the house an event is about', () => {
    expect(objectionsToRecording(draft({
      name: 'cart_add',
      productId: '11111111-1111-4111-8111-111111111111',
      sellerId: '22222222-2222-4222-8222-222222222222',
    }))).toEqual([]);
  });

  /*
   * The strongest privacy guarantee in this module is a type, not a rule: there
   * is no field for a customer, an order, a search term, a source or a campaign,
   * so no caller can pass one. Migration 0023 refuses the same five columns at
   * the database, which is what makes this more than a convention.
   */
  it('has no field for anything that identifies a person', () => {
    const keys = Object.keys(draft({
      productId: '11111111-1111-4111-8111-111111111111',
      sellerId: '22222222-2222-4222-8222-222222222222',
    }));
    expect(keys.sort()).toEqual(['anonymousId', 'name', 'productId', 'sellerId']);
  });
});
