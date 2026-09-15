import { describe, expect, it } from 'vitest';
import { cairoDayStart, cairoPeriod } from './report-period';

describe('the start of a Cairo day', () => {
  it('is 22:00 UTC the evening before, in winter (UTC+2)', () => {
    expect(cairoDayStart(new Date('2026-01-15T09:00:00Z')).toISOString())
      .toBe('2026-01-14T22:00:00.000Z');
  });

  it('is 21:00 UTC the evening before, in summer (UTC+3)', () => {
    // Egypt reinstated daylight saving in 2023. A fixed +2 would start every
    // summer day an hour late and hand each evening's last hour to tomorrow.
    expect(cairoDayStart(new Date('2026-07-15T09:00:00Z')).toISOString())
      .toBe('2026-07-14T21:00:00.000Z');
  });

  it('an order at 23:30 Cairo time belongs to THAT day, not the next UTC one', () => {
    // 23:30 in Cairo on 15 July is 20:30 UTC — still the 15th in both. But
    // 00:30 on the 16th in Cairo is 21:30 UTC on the 15th: a UTC day would
    // file it under the wrong date.
    const justAfterMidnight = new Date('2026-07-15T21:30:00Z');
    expect(cairoDayStart(justAfterMidnight).toISOString()).toBe('2026-07-15T21:00:00.000Z');
  });

  it('finds the first instant of the spring day that has NO midnight', () => {
    /*
     * Summer time begins on the last Friday of April: clocks go from 00:00
     * straight to 01:00. On 24 April 2026 the first instant of the day is
     * 01:00+03, which is 22:00 UTC on the 23rd. Subtracting a fixed three hours
     * would start the day at 21:00 UTC — an hour of the 23rd filed as the 24th.
     */
    expect(cairoDayStart(new Date('2026-04-24T12:00:00Z')).toISOString())
      .toBe('2026-04-23T22:00:00.000Z');
  });
});

describe('a reporting period', () => {
  const asOf = new Date('2026-09-15T12:00:00Z'); // 15:00 in Cairo (UTC+3)

  it('"today" runs from Cairo midnight until now', () => {
    const p = cairoPeriod(asOf, 1);
    expect(p.from.toISOString()).toBe('2026-09-14T21:00:00.000Z');
    expect(p.to.toISOString()).toBe(asOf.toISOString());
  });

  it('"last 7 days" starts at a Cairo midnight six days earlier — whole days, not 168 hours', () => {
    expect(cairoPeriod(asOf, 7).from.toISOString()).toBe('2026-09-08T21:00:00.000Z');
  });

  it('stays on Cairo midnights across the autumn change of clocks', () => {
    // Summer time ends at the end of October; a period reaching back across it
    // must start at a WINTER midnight (22:00 UTC), not an hour off.
    const november = new Date('2026-11-05T10:00:00Z');
    expect(cairoPeriod(november, 14).from.toISOString()).toBe('2026-10-22T21:00:00.000Z');
    expect(cairoPeriod(november, 7).from.toISOString()).toBe('2026-10-29T22:00:00.000Z');
  });

  it('refuses a period that is not a positive whole number of days', () => {
    for (const days of [0, -1, 1.5]) {
      expect(() => cairoPeriod(asOf, days)).toThrow(RangeError);
    }
  });
});
