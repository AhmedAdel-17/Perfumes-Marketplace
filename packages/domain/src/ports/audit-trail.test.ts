import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, diffFields } from './audit-trail';

describe('what changed between two versions of a row', () => {
  it('reports only the fields that moved', () => {
    // A diff of one column is readable and a dump of forty is not — and the
    // dump quietly turns the audit log into a second copy of every table.
    const diff = diffFields(
      { price: 100, stock: 5, name: 'ليل' },
      { price: 120, stock: 5 },
    );
    expect(JSON.parse(diff.before!)).toEqual({ price: 100 });
    expect(JSON.parse(diff.after!)).toEqual({ price: 120 });
  });

  it('says nothing when nothing changed', () => {
    /*
     * The caller uses this to decline writing an entry at all.
     *
     * An audit trail full of "somebody pressed save and changed nothing" is one
     * people stop reading, and an audit trail people stop reading is the same
     * as not having one.
     */
    expect(diffFields({ price: 100 }, { price: 100 })).toEqual({ before: null, after: null });
  });

  it('treats a field going missing as a change', () => {
    const diff = diffFields({ reason: 'prohibited_claim' }, { reason: null });
    expect(JSON.parse(diff.after!)).toEqual({ reason: null });
  });

  it('compares arrays by value, not by identity', () => {
    // Two arrays with the same contents are not the same object, and a naive
    // `!==` would record a change on every save of an unedited notes list.
    expect(diffFields({ notes: ['ورد'] }, { notes: ['ورد'] }))
      .toEqual({ before: null, after: null });
    expect(diffFields({ notes: ['ورد'] }, { notes: ['عود'] }).after).toBeTruthy();
  });

  it('ignores fields the caller did not mention', () => {
    // `after` is a PARTIAL. A field absent from it was not being set, which is
    // different from being set to undefined.
    expect(diffFields({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: null, after: null });
  });
});

describe('the vocabulary', () => {
  it('covers the actions doc 04 §8 names as gates', () => {
    for (const action of [
      'listing_moderation', 'payout_approval', 'payout_adjustment',
      'commission_rate_change', 'policy_change',
    ]) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});
