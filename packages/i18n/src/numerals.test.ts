import { describe, expect, it } from 'vitest';
import { CURRENCY_LABEL, data, editorial, formatNumber, formatPrice, internal } from './numerals';
import { t } from './index';

describe('the numeral rule — Arabic-Indic is editorial, Western is data', () => {
  it('renders editorial counts in Arabic-Indic', () => {
    expect(editorial(42)).toBe('٤٢');
    expect(editorial(1998, false)).toBe('١٩٩٨');
  });

  it('renders data in Western digits', () => {
    expect(data(450)).toBe('450');
    expect(data(2325)).toBe('2,325');
  });

  it('groups thousands, and can be told not to', () => {
    expect(formatNumber(41200)).toBe('41,200');
    expect(formatNumber(2026, { group: false })).toBe('2026');
  });
});

describe('prices are ALWAYS Western — no exception, no context', () => {
  it('has no editorial mode at all', () => {
    expect(formatPrice(45000)).toBe('450');
    expect(formatPrice(232500)).toBe('2,325');
  });

  it('shows piastres only when they exist', () => {
    expect(formatPrice(45000)).toBe('450');
    expect(formatPrice(45050)).toBe('450.50');
    expect(formatPrice(45000, { decimals: true })).toBe('450.00');
  });

  it('never emits an Arabic-Indic digit, whatever the surrounding copy', () => {
    for (const p of [0, 1, 999, 45050, 1234567]) {
      expect(formatPrice(p)).not.toMatch(/[٠-٩]/);
    }
  });

  it('renders the currency as a separate Latin label, never a glyph', () => {
    expect(CURRENCY_LABEL).toBe('EGP');
    expect(formatPrice(45000)).not.toContain(CURRENCY_LABEL);
  });

  it('marks negatives with a true minus sign, not a hyphen', () => {
    expect(formatPrice(-45000)).toBe('−450');
    expect(formatPrice(-45000).charCodeAt(0)).toBe(0x2212);
  });
});

describe('internal tools are 100% Western', () => {
  it('ignores an editorial request on an internal surface', () => {
    expect(formatNumber(42, { context: 'editorial', surface: 'internal' })).toBe('42');
  });

  it('customer surfaces still honour editorial', () => {
    expect(formatNumber(42, { context: 'editorial', surface: 'customer' })).toBe('٤٢');
  });
});

describe('one decision point — the rule cannot drift', () => {
  it('the same value renders differently only by declared context', () => {
    expect(formatNumber(380, { context: 'editorial' })).toBe('٣٨٠');
    expect(formatNumber(380, { context: 'data' })).toBe('380');
  });

  it('defaults to data, so an unannotated number is never editorial by accident', () => {
    expect(formatNumber(7)).toBe('7');
  });
});

describe('copy layer', () => {
  it('resolves a nested key', () => {
    expect(t('cart.title')).toBe('الحقيبة');
    expect(t('seller.yourNet')).toBe('صافيك');
  });

  it('throws on a missing key rather than rendering blank', () => {
    expect(() => t('cart.nope')).toThrow(/Missing copy key/);
  });

  it('carries the lines that encode policy, not just labels', () => {
    expect(t('cart.eachHouseShips')).toContain('كل دار تشحن طلبها بنفسها');
    expect(t('order.yourOrderOurResponsibility')).toContain('مسؤوليتنا');
    expect(t('seller.weDontChargeForDemandWeDidntCreate')).toContain('لم نصنع طلبه');
  });
});

describe('operating tools always get Western digits', () => {
  it('ignores the editorial context on an internal surface', () => {
    // The seller portal, ops, CMS and BI are tools, not brand surfaces. A house
    // counting its own orders is not being marketed to.
    expect(formatNumber(3, { context: 'editorial', surface: 'internal' })).toBe('3');
    expect(formatNumber(1250, { context: 'editorial', surface: 'internal' })).toBe('1,250');
  });

  it('internal() says which rule it obeys, rather than arriving there by luck', () => {
    // Those call sites used data(), which gives the same digits for a different
    // reason. Nothing in them said "internal", so a later change to editorial()
    // would have broken the rule with every test still green.
    expect(internal(3)).toBe('3');
    expect(internal(3)).toBe(formatNumber(3, { context: 'data', surface: 'internal' }));
  });

  it('still gives a CUSTOMER editorial numerals, which is the whole distinction', () => {
    expect(editorial(3)).toBe('٣');
    expect(internal(3)).not.toBe(editorial(3));
  });
});
