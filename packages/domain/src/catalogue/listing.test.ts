import { describe, expect, it } from 'vitest';
import { InvalidTransition, UnauthorisedActor } from '../errors/index';
import {
  canMoveListing, isListingVisible, LISTING_ACTORS, LISTING_STATES,
  moveListing, nextListingStates, type ListingState,
} from './listing';
import {
  isListingComplete, listingGaps, LISTING_FIELDS, UNENFORCED_GROUPS,
  type ListingDraft,
} from './completeness';

/* ------------------------------------------------------- the state machine */

describe('who may move a listing', () => {
  it('lets a house submit its own draft', () => {
    expect(moveListing('draft', 'pending_moderation', 'seller').to).toBe('pending_moderation');
  });

  it('refuses to let a house publish itself', () => {
    // The whole reason moderation exists: the trademark exposure of a bad
    // claim lands on the platform, not on the house that wrote it.
    expect(() => moveListing('pending_moderation', 'published', 'seller'))
      .toThrow(UnauthorisedActor);
  });

  it('refuses to let a house un-suspend itself', () => {
    expect(() => moveListing('suspended', 'published', 'seller')).toThrow();
  });

  it('sends a suspended listing back through the queue, not straight to the shop', () => {
    expect(canMoveListing('suspended', 'pending_moderation', 'seller')).toBe(true);
    expect(canMoveListing('suspended', 'published', 'platform')).toBe(false);
  });

  it('distinguishes "nobody may" from "you may not"', () => {
    /*
     * Two different errors, and the difference is what a house is told. Being
     * told a legal move is impossible, when the real answer is that the
     * platform performs it, produces a support ticket about a bug that is not
     * one.
     */
    expect(() => moveListing('pending_moderation', 'published', 'seller'))
      .toThrow(UnauthorisedActor);
    expect(() => moveListing('draft', 'published', 'platform'))
      .toThrow(InvalidTransition);
  });

  it('names the listing in the error, not the sub-order', () => {
    expect(() => moveListing('draft', 'published', 'platform')).toThrow(/listing/);
  });

  it('never lets a listing move to itself', () => {
    for (const state of LISTING_STATES) {
      for (const actor of LISTING_ACTORS) {
        expect(canMoveListing(state, state, actor), `${state} by ${actor}`).toBe(false);
      }
    }
  });

  it('leaves every state enterable and leavable', () => {
    // A state nothing enters is dead schema; a state nothing leaves is a trap
    // that needs a database console to escape.
    for (const state of LISTING_STATES) {
      const enterable = LISTING_STATES.some((from) => LISTING_ACTORS.some(
        (actor) => canMoveListing(from, state, actor),
      ));
      const leavable = LISTING_ACTORS.some((actor) => nextListingStates(state, actor).length > 0);
      expect(enterable || state === 'draft', `nothing enters ${state}`).toBe(true);
      expect(leavable, `nothing leaves ${state}`).toBe(true);
    }
  });

  it('offers each destination once, even when both actors may reach it', () => {
    // `draft` is reachable from `pending_moderation` by either party. A list
    // with it twice puts two identical buttons on a screen.
    const destinations = nextListingStates('pending_moderation', 'platform');
    expect(new Set(destinations).size).toBe(destinations.length);
  });
});

describe('a decision about somebody else\'s product carries a reason', () => {
  it('refuses to send a listing back without one', () => {
    expect(() => moveListing('pending_moderation', 'draft', 'platform')).toThrow(/reason/);
  });

  it('refuses to suspend without one', () => {
    expect(() => moveListing('published', 'suspended', 'platform')).toThrow(/reason/);
  });

  it('accepts a coded reason', () => {
    const move = moveListing('pending_moderation', 'draft', 'platform', 'prohibited_claim');
    expect(move.reason).toBe('prohibited_claim');
  });

  it('does not demand one when a HOUSE withdraws its own submission', () => {
    // Nobody is being judged, so there is nothing to record a reason about.
    expect(moveListing('pending_moderation', 'draft', 'seller').reason).toBeNull();
  });

  it('does not demand one to publish', () => {
    expect(() => moveListing('pending_moderation', 'published', 'platform')).not.toThrow();
  });
});

describe('what a visitor sees', () => {
  it.each(LISTING_STATES)('%s', (state) => {
    expect(isListingVisible(state as ListingState)).toBe(state === 'published');
  });
});

/* ---------------------------------------------------------- completeness */

const complete = (): ListingDraft => ({
  name: 'ليل القاهرة',
  slug: 'layl-cairo',
  sku: 'NUR-LQ-50',
  brandId: '00000000-0000-4000-8000-000000000000',
  pricePiastres: 45000,
  volumeMl: 50,
  stock: 12,
  fulfilmentHours: 48,
  concentration: 'eau_de_parfum',
  form: 'spray',
  genderPositioning: 'unisex',
  scentFamily: 'oriental',
  notesTop: ['برغموت'],
  notesHeart: ['ورد'],
  notesBase: ['عود'],
  seasons: ['winter'],
  dayNight: 'night',
  occasions: ['evening'],
  projectionBand: 'moderate',
  longevityBand: 'long',
  performanceSource: 'seller_provided',
  responsiblePartyName: 'ميزون نور',
  returnEligibility: 'sealed_only',
  defectRoute: 'استبدال خلال ١٤ يومًا',
});

describe('whether a listing may be submitted', () => {
  it('accepts a complete one', () => {
    expect(listingGaps(complete())).toEqual([]);
    expect(isListingComplete(complete())).toBe(true);
  });

  it.each(LISTING_FIELDS)('requires %s', (field) => {
    const draft = { ...complete(), [field]: null };
    expect(listingGaps(draft).map((g) => g.field)).toContain(field);
  });

  it('reports every gap at once, not the first', () => {
    const gaps = listingGaps({ name: 'اسم فقط' });
    expect(gaps.length).toBeGreaterThan(15);
  });

  it('treats an empty notes array as missing', () => {
    // It passes a NOT NULL constraint and means nothing on the page.
    expect(listingGaps({ ...complete(), notesTop: [] }).map((g) => g.field))
      .toContain('notesTop');
  });

  it('treats whitespace as missing', () => {
    expect(listingGaps({ ...complete(), name: '   ' }).map((g) => g.field)).toContain('name');
  });

  it('refuses a price of zero, which every required-field check passes', () => {
    const gaps = listingGaps({ ...complete(), pricePiastres: 0 });
    expect(gaps).toContainEqual({ field: 'pricePiastres', code: 'implausible' });
  });

  it('refuses a negative price', () => {
    expect(listingGaps({ ...complete(), pricePiastres: -100 })
      .some((g) => g.field === 'pricePiastres')).toBe(true);
  });

  it('refuses a promotional price that is not a promotion', () => {
    for (const promo of [45000, 50000, 0, -1]) {
      expect(
        listingGaps({ ...complete(), promoPricePiastres: promo })
          .some((g) => g.field === 'promoPricePiastres'),
        `promo ${promo}`,
      ).toBe(true);
    }
  });

  it('accepts a promotional price that is one', () => {
    expect(listingGaps({ ...complete(), promoPricePiastres: 39000 })).toEqual([]);
  });

  it('refuses negative stock', () => {
    expect(listingGaps({ ...complete(), stock: -1 })
      .some((g) => g.field === 'stock')).toBe(true);
  });

  it('accepts zero stock, which is a fact rather than an error', () => {
    // A house that has sold out has not made a mistake.
    expect(listingGaps({ ...complete(), stock: 0 })).toEqual([]);
  });

  it.each([0, -5, 400])('refuses a fulfilment promise of %s hours', (hours) => {
    expect(listingGaps({ ...complete(), fulfilmentHours: hours })
      .some((g) => g.field === 'fulfilmentHours')).toBe(true);
  });

  it('names the groups it does not yet enforce', () => {
    // Media and attribution are two of doc 04's eight groups and neither is
    // built. Naming them keeps the gap visible instead of forgotten.
    expect(UNENFORCED_GROUPS).toContain('media');
    expect(UNENFORCED_GROUPS).toContain('attribution');
  });
});
