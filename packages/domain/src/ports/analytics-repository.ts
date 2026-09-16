/**
 * Port: the browsing trail — WORK_PLAN 9.5.
 *
 * Two methods, and they have different callers by design: the shop WRITES one
 * event at a time as a visitor moves, and the owner's report READS counts for a
 * period. Nothing reads an individual event back, and no method here can return
 * one — a port that could hand back a visitor's trail is a port somebody will
 * one day use to do exactly that.
 *
 * What may be written is decided by `browsing-events.ts` and, again, by the
 * database's own policy (migration 0023).
 */
import type { BrowsingEvent } from '../insights/browsing-events';

export interface RecordedBrowsingEvent {
  readonly name: BrowsingEvent;
  readonly anonymousId: string;
  readonly productId: string | null;
  readonly sellerId: string | null;
  readonly occurredAt: Date;
}

/**
 * One event name's numbers for a period.
 *
 * `visitors` counts DISTINCT anonymous ids, not rows: one person refreshing a
 * product page twenty times is one visitor who viewed it, and a funnel built on
 * rows would show that person as twenty people who never bought.
 */
export interface BrowsingCount {
  readonly name: BrowsingEvent;
  readonly events: number;
  readonly visitors: number;
}

export interface AnalyticsRepository {
  /**
   * Append one event.
   *
   * Returns nothing: the caller is a page view, not a transaction anybody waits
   * on, and an id handed back would invite something to start referring to one.
   */
  record(event: RecordedBrowsingEvent): Promise<void>;

  /**
   * Counts per event name, for `[from, to)` — half-open, like every other period
   * in this system, so a day's last millisecond belongs to one day only.
   *
   * Names with no events in the period are absent. The report decides what a
   * missing name means; the repository does not invent a zero row for it.
   */
  countsInPeriod(from: Date, to: Date): Promise<BrowsingCount[]>;
}
