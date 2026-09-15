import { describe, expect, it } from 'vitest';
import {
  ALT_TEXT_MAX, MAX_PHOTOS, objectionsToAddingPhoto, objectionsToDescribing,
  objectionsToRemovingPhoto, reorderedPhotos,
} from './photo-set';

const described = { alt: 'زجاجة ليل القاهرة على رخام أسود', ownershipConfirmed: true };

describe('adding a photograph', () => {
  it('accepts a described, owned photograph while there is room', () => {
    expect(objectionsToAddingPhoto({ existing: 0, ...described })).toEqual([]);
    expect(objectionsToAddingPhoto({ existing: MAX_PHOTOS - 1, ...described })).toEqual([]);
  });

  it('refuses a ninth — a gallery, not a camera roll', () => {
    expect(objectionsToAddingPhoto({ existing: MAX_PHOTOS, ...described })).toContain('too_many_photos');
  });

  it('refuses a photograph the house has not confirmed it owns', () => {
    expect(objectionsToAddingPhoto({ existing: 0, alt: described.alt, ownershipConfirmed: false }))
      .toContain('ownership_unconfirmed');
  });

  it('reports every objection at once', () => {
    expect(objectionsToAddingPhoto({ existing: MAX_PHOTOS, alt: '   ', ownershipConfirmed: false }).sort())
      .toEqual(['alt_required', 'ownership_unconfirmed', 'too_many_photos']);
  });
});

describe('describing a photograph', () => {
  it('requires words — whitespace is not a description', () => {
    expect(objectionsToDescribing({ alt: ' \n ', ownershipConfirmed: true })).toEqual(['alt_required']);
  });

  it('keeps it a sentence', () => {
    expect(objectionsToDescribing({ alt: 'ا'.repeat(ALT_TEXT_MAX), ownershipConfirmed: true })).toEqual([]);
    expect(objectionsToDescribing({ alt: 'ا'.repeat(ALT_TEXT_MAX + 1), ownershipConfirmed: true }))
      .toEqual(['alt_too_long']);
  });
});

describe('removing a photograph', () => {
  const primary = { id: 'p1', isPrimary: true };
  const secondary = { id: 'p2', isPrimary: false };

  it('refuses to strip the primary photograph from a live listing', () => {
    expect(objectionsToRemovingPhoto({ photo: primary, listingState: 'published' }))
      .toEqual(['primary_of_live_listing']);
  });

  it('refuses it for a listing awaiting review too — it is about to be live', () => {
    expect(objectionsToRemovingPhoto({ photo: primary, listingState: 'pending_moderation' }))
      .toEqual(['primary_of_live_listing']);
  });

  it('allows it on a draft, and allows any non-primary photograph anywhere', () => {
    expect(objectionsToRemovingPhoto({ photo: primary, listingState: 'draft' })).toEqual([]);
    expect(objectionsToRemovingPhoto({ photo: secondary, listingState: 'published' })).toEqual([]);
  });
});

describe('reordering photographs', () => {
  const current = [{ id: 'a', isPrimary: true }, { id: 'b', isPrimary: false }, { id: 'c', isPrimary: false }];

  it('accepts a permutation of exactly the photographs there are', () => {
    expect(reorderedPhotos(current, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('refuses a stale list — a missing, extra, unknown or repeated id', () => {
    // A house looking at an old screen must not reorder the photographs it
    // cannot see into places nobody chose.
    expect(reorderedPhotos(current, ['a', 'b'])).toBeNull();
    expect(reorderedPhotos(current, ['a', 'b', 'c', 'd'])).toBeNull();
    expect(reorderedPhotos(current, ['a', 'b', 'x'])).toBeNull();
    expect(reorderedPhotos(current, ['a', 'a', 'b'])).toBeNull();
  });
});
