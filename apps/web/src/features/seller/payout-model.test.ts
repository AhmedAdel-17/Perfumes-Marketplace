import { describe, expect, it } from 'vitest';
import { statementCsv, summarisePayouts } from './payout-model';

describe('seller statement presentation facts', () => {
  it('counts only recorded paid status as paid and preserves negative statement net', () => {
    expect(summarisePayouts([
      { status: 'paid', netPiastres: 10500 }, { status: 'approved', netPiastres: 9000 },
      { status: 'disputed', netPiastres: -1000 }, { status: 'held', netPiastres: 3000 },
    ])).toEqual({ count: 4, paidPiastres: 10500, unpaidPiastres: 11000 });
    expect(summarisePayouts([])).toEqual({ count: 0, paidPiastres: 0, unpaidPiastres: 0 });
  });
  it('exports original line facts in integer piastres, including added shipping and net', () => {
    const csv = statementCsv('PAY-1', [{ subOrderReference: 'ORDER-1', commissionSource: 'organic_search',
      commissionBps: 1500, grossPiastres: 10000, commissionPiastres: 1500, shippingPiastres: 2000, netPiastres: 10500 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"PAY-1","ORDER-1","organic_search","1500","10000","1500","2000","10500"');
  });
  it('escapes quoted data and neutralises spreadsheet formulas while leaving numeric negatives intact', () => {
    const csv = statementCsv('  =HYPERLINK("evil")', [{ subOrderReference: '@SUM(1)', commissionSource: '"quoted",source',
      commissionBps: 0, grossPiastres: 0, commissionPiastres: 0, shippingPiastres: 0, netPiastres: -100 }]);
    expect(csv).toContain('"\'  =HYPERLINK(""evil"")"');
    expect(csv).toContain('"\'@SUM(1)"');
    expect(csv).toContain('"""quoted"",source"');
    expect(csv).toContain('"-100"');
  });
});
