import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_AR, AUDIT_EMPTY_AR, AUDIT_ENTITY_AR, describeAuditChange,
} from './audit';

describe('an audit entry, in words', () => {
  it('names a house going live in the console words, not the enum', () => {
    const lines = describeAuditChange({
      entityTable: 'sellers',
      before: JSON.stringify({ status: 'approved' }),
      after: JSON.stringify({ status: 'live' }),
    });
    expect(lines).toEqual([
      { field: 'status', label: 'الحالة', from: 'معتمدة — لم تبدأ البيع', to: 'تبيع الآن' },
    ]);
  });

  it('reads `status` by what it belongs to — a listing is not a house', () => {
    const [line] = describeAuditChange({
      entityTable: 'products',
      before: JSON.stringify({ status: 'pending_moderation' }),
      after: JSON.stringify({ status: 'published', reason: null }),
    });
    expect(line).toMatchObject({ from: 'قيد المراجعة', to: 'منشور' });
  });

  it('shows a cleared value as empty, which is different from not mentioned', () => {
    const lines = describeAuditChange({
      entityTable: 'products',
      before: JSON.stringify({ status: 'pending_moderation' }),
      after: JSON.stringify({ status: 'published', reason: null }),
    });
    const reason = lines.find((line) => line.field === 'reason');
    expect(reason).toEqual({ field: 'reason', label: 'السبب', from: null, to: AUDIT_EMPTY_AR });
  });

  it('states money in pounds with the currency named, never as piastres', () => {
    const [line] = describeAuditChange({
      entityTable: 'sub_orders',
      before: null,
      after: JSON.stringify({ collectedPiastres: 49_500 }),
    });
    expect(line!.label).toBe('المبلغ المحصّل');
    expect(line!.to).toContain('EGP');
    expect(line!.to).not.toContain('49500');
  });

  it('leaves out a field that did not move, so the one that did is visible', () => {
    const lines = describeAuditChange({
      entityTable: 'returns',
      before: JSON.stringify({ state: 'received', costBearer: 'seller' }),
      after: JSON.stringify({ state: 'refunded', costBearer: 'seller', refundPiastres: 45_000 }),
    });
    expect(lines.map((line) => line.field)).toEqual(['state', 'refundPiastres']);
  });

  it('does not show identifiers — a uuid is not information to a person', () => {
    const lines = describeAuditChange({
      entityTable: 'payouts',
      before: null,
      after: JSON.stringify({ reference: 'PO-CDFHJKMN', sellerId: '9f0c…' }),
    });
    expect(lines.map((line) => line.field)).toEqual(['reference']);
  });

  it('HIDES NOTHING it cannot translate — unknown keys and values are shown as written', () => {
    /*
     * The failure this refuses is the quiet one: an audit screen that drops
     * whatever it has no word for is a screen that can be made to omit a
     * decision by recording it under a new field name.
     */
    const lines = describeAuditChange({
      entityTable: 'sellers',
      before: JSON.stringify({ status: 'something_new' }),
      after: JSON.stringify({ tier: 'gold' }),
    });
    expect(lines).toContainEqual({ field: 'tier', label: 'tier', from: null, to: 'gold' });
    expect(lines).toContainEqual({ field: 'status', label: 'الحالة', from: 'something_new', to: null });
  });

  it('survives an entry that is not JSON at all', () => {
    const lines = describeAuditChange({ entityTable: 'sellers', before: null, after: 'نص حرّ' });
    expect(lines).toEqual([{ field: 'value', label: 'value', from: null, to: 'نص حرّ' }]);
  });

  it('names a moderation decision and its boolean in words', () => {
    const [line] = describeAuditChange({
      entityTable: 'reviews',
      before: JSON.stringify({ hidden: false }),
      after: JSON.stringify({ hidden: true, note: 'لغة مسيئة' }),
    });
    expect(line).toMatchObject({ label: 'الظهور', from: 'ظاهر', to: 'مخفي' });
  });
});

describe('the audit vocabulary', () => {
  it('has a word for every action the database enum allows', () => {
    // Mirrors `AUDIT_ACTIONS` in the domain; the api package checks the two
    // lists against each other, since this package cannot import the domain.
    expect(Object.keys(AUDIT_ACTION_AR)).toHaveLength(10);
    for (const words of Object.values(AUDIT_ACTION_AR)) expect(words).toMatch(/[؀-ۿ]/);
  });

  it('names every entity a decision is recorded against today', () => {
    for (const table of ['sellers', 'products', 'reviews', 'returns', 'payouts', 'content_pages']) {
      expect(AUDIT_ENTITY_AR).toHaveProperty(table);
    }
  });
});
