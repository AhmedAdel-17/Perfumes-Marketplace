import { describe, expect, it } from 'vitest';
import {
  APPLICATION_NOTE_MAX, APPLICATION_NOTE_MIN,
  houseSlug, objectionsToApplying,
} from './application';

const apply = (overrides: Partial<Parameters<typeof objectionsToApplying>[0]> = {}) =>
  objectionsToApplying({
    tradingName: 'ميزون نور',
    latinName: 'Maison Nour',
    ownerName: 'نور عبد الله',
    city: 'القاهرة',
    note: 'دار عطور صغيرة في وسط البلد، نصنع بكميات محدودة منذ ٢٠١٩ ونعبّئ بأنفسنا.',
    ...overrides,
  });

describe('the storefront address', () => {
  it('comes from the Latin wordmark', () => {
    expect(houseSlug('Maison Nour')).toBe('maison-nour');
    expect(houseSlug('ATELIER  SIWA')).toBe('atelier-siwa');
  });

  it('keeps a letter that carries a mark rather than dropping it', () => {
    // "Café" losing its last letter gives `caf`, which is a different word and
    // a permanent URL the house prints on its packaging.
    expect(houseSlug('Café Noir')).toBe('cafe-noir');
  });

  it('never ends in a hyphen, even after truncation', () => {
    // The slice can land on a separator, and a trailing hyphen in a URL is the
    // kind of thing that gets silently corrected by one system and not another.
    const slug = houseSlug(`${'a'.repeat(59)} bcdef`);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('collapses punctuation instead of encoding it', () => {
    expect(houseSlug("D'Or & Co.")).toBe('d-or-co');
  });
});

describe('what an application has to contain', () => {
  it('accepts an ordinary one', () => {
    expect(apply()).toEqual([]);
  });

  it('refuses the Arabic name typed into the Latin box', () => {
    /*
     * The commonest way this form goes wrong, and the consequence is silent:
     * `houseSlug` strips every non-Latin character, so the house would end up
     * at `/house/` with an empty slug.
     */
    const objections = apply({ latinName: 'ميزون نور' });
    expect(objections).toContain('latin_name_not_latin');
    expect(houseSlug('ميزون نور')).toBe('');
  });

  it('refuses a wordmark that produces a slug nobody could use', () => {
    // A real Latin letter, and still not enough to address a storefront with.
    expect(apply({ latinName: 'A' })).toContain('unusable_slug');
    expect(apply({ latinName: 'A.' })).toContain('unusable_slug');
    // Punctuation alone is not a Latin name at all, and is reported as that
    // rather than as a slug problem — the two need different corrections.
    expect(apply({ latinName: '!!' })).toEqual(['latin_name_not_latin']);
  });

  it('refuses a slug that would read as an endorsement', () => {
    // `/house/diyar` is the marketplace endorsing itself as a house.
    expect(apply({ latinName: 'Diyar' })).toContain('unusable_slug');
    expect(apply({ latinName: 'Support' })).toContain('unusable_slug');
  });

  it('requires the name, the owner and the city', () => {
    expect(apply({ tradingName: '  ' })).toContain('trading_name_required');
    expect(apply({ ownerName: '' })).toContain('owner_name_required');
    expect(apply({ city: '' })).toContain('city_required');
  });

  it('requires a real paragraph, not a word', () => {
    /*
     * The note is what an operator reads before any verification starts. "عطور"
     * is not an application; it is a category. The floor is low enough that a
     * genuine small maker clears it in one sentence.
     */
    expect(apply({ note: 'عطور' })).toContain('note_too_short');
    expect(apply({ note: 'ا'.repeat(APPLICATION_NOTE_MIN) })).toEqual([]);
    expect(apply({ note: 'ا'.repeat(APPLICATION_NOTE_MAX + 1) })).toContain('note_too_long');
  });

  it('reports every objection at once', () => {
    const objections = apply({ tradingName: '', latinName: '', note: '' });
    expect(objections).toContain('trading_name_required');
    expect(objections).toContain('latin_name_required');
    expect(objections).toContain('note_too_short');
  });
});
