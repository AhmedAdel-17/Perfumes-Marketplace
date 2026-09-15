/**
 * A reporting period, bounded by CAIRO midnights.
 *
 * `docs/ANALYTICS_DEFINITIONS.md` rule 4: a UTC day splits an Egyptian evening —
 * the busiest perfume-buying hours — across two dates, so "yesterday's orders"
 * in UTC is yesterday from 2 a.m. to 2 a.m. and nobody in Cairo means that.
 *
 * WHY NOT `offset = +2`. Egypt reinstated daylight saving in 2023: +2 in
 * winter, +3 in summer. And on the day summer time begins the clocks jump from
 * midnight straight to one o'clock — that day has no 00:00 at all. A fixed
 * offset is wrong for half the year; a clever one is wrong for an hour a year,
 * which is exactly the kind of wrong that is never noticed. So the start of a
 * Cairo day is found rather than computed: the earliest instant whose Cairo
 * calendar date is that day.
 *
 * `Intl` only. The dependency rule forbids reaching for the environment, not
 * the language's own calendar; the time zone database ships with the runtime.
 */

const ZONE = 'Africa/Cairo';
const HOUR = 3_600_000;

export interface Period {
  /** Inclusive — a Cairo midnight (or the first instant of the day, when midnight is skipped). */
  readonly from: Date;
  /** Exclusive. */
  readonly to: Date;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** The Cairo calendar date and hour of an instant. */
function cairoParts(at: Date): { year: number; month: number; day: number; hour: number } {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/**
 * The first instant of the Cairo calendar day containing `at`.
 *
 * Cairo is UTC+2 or UTC+3, so a day's first instant is UTC midnight of that
 * date minus three hours or minus two. Whichever of the two candidates is the
 * earliest instant still ON that Cairo date is the answer — which also handles
 * the spring morning when 00:00 does not exist and the day begins at 01:00.
 */
export function cairoDayStart(at: Date): Date {
  const { year, month, day } = cairoParts(at);
  const utcMidnight = Date.UTC(year, month - 1, day);
  for (const offsetHours of [3, 2]) {
    const candidate = new Date(utcMidnight - offsetHours * HOUR);
    const local = cairoParts(candidate);
    if (local.year === year && local.month === month && local.day === day) return candidate;
  }
  // Unreachable while Cairo stays within UTC+2..+3. Loud if that ever changes,
  // rather than silently reporting a day that starts at the wrong hour.
  throw new RangeError(`Could not locate the start of the Cairo day containing ${at.toISOString()}`);
}

/**
 * The last `days` Cairo calendar days, today included, up to `asOf`.
 *
 * "Last 7 days" on a Tuesday afternoon is from last Wednesday's Cairo midnight
 * until now — not a rolling 168 hours, which would cut a day in half at both
 * ends and make the same report give different totals an hour apart.
 */
export function cairoPeriod(asOf: Date, days: number): Period {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`A reporting period is a positive whole number of days, received ${days}`);
  }
  const today = cairoDayStart(asOf);
  // Step back by calendar days, re-anchoring each time: stepping 24 hours
  // across a daylight-saving change would land an hour off midnight.
  let from = today;
  for (let i = 1; i < days; i += 1) {
    from = cairoDayStart(new Date(from.getTime() - 12 * HOUR));
  }
  return { from, to: asOf };
}
