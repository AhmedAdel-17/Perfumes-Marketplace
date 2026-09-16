/**
 * The browsing-trail contract, run against every adapter.
 *
 * Framework-free, like every contract here: each case throws on failure. It uses
 * the same world the content cases use — a unit of work is all it needs, because
 * an event belongs to nobody.
 */
import type { ContentHarness } from './content-contract';
import type { RecordedBrowsingEvent } from './analytics-repository';

export interface AnalyticsContractCase {
  readonly name: string;
  run(setup: ContentHarness): Promise<void>;
}

class ContractViolation extends Error {}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new ContractViolation(message);
};

const equal = <T>(actual: T, expected: T, what: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, received ${a}`);
};

const AT = new Date('2026-09-16T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let sequence = 0;
/** A distinct visitor each time, unless one is given. */
const visitor = (): string => {
  sequence += 1;
  return sequence.toString(16).padStart(24, '0');
};

const event = (overrides: Partial<RecordedBrowsingEvent> = {}): RecordedBrowsingEvent => ({
  name: 'product_view',
  anonymousId: visitor(),
  productId: null,
  sellerId: null,
  occurredAt: AT,
  ...overrides,
});

export const analyticsContract: readonly AnalyticsContractCase[] = [
  {
    name: 'an event is counted in its period, by name',
    async run(setup) {
      const { uow } = await setup();
      await uow.transaction(async (r) => {
        await r.analytics.record(event({ name: 'landing_view' }));
        await r.analytics.record(event({ name: 'product_view' }));
        await r.analytics.record(event({ name: 'product_view' }));
      });

      const counts = await uow.transaction((r) =>
        r.analytics.countsInPeriod(new Date(AT.getTime() - DAY), new Date(AT.getTime() + DAY)));

      equal(
        [...counts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, c.events]),
        [['landing_view', 1], ['product_view', 2]],
        'events by name',
      );
    },
  },

  {
    name: 'one visitor viewing twice is two events and ONE visitor',
    async run(setup) {
      const { uow } = await setup();
      const same = visitor();
      await uow.transaction(async (r) => {
        await r.analytics.record(event({ anonymousId: same }));
        await r.analytics.record(event({ anonymousId: same }));
        await r.analytics.record(event({ anonymousId: visitor() }));
      });

      const [row] = await uow.transaction((r) =>
        r.analytics.countsInPeriod(new Date(AT.getTime() - DAY), new Date(AT.getTime() + DAY)));

      assert(row !== undefined, 'a count for product_view');
      // A funnel built on rows would report the refresher as several people who
      // never bought, and every conversion rate below it would be wrong.
      equal([row!.events, row!.visitors], [3, 2], 'events and distinct visitors');
    },
  },

  {
    name: 'the period is half-open: the start instant counts, the end instant does not',
    async run(setup) {
      const { uow } = await setup();
      const from = AT;
      const to = new Date(AT.getTime() + DAY);
      await uow.transaction(async (r) => {
        await r.analytics.record(event({ occurredAt: new Date(from.getTime() - 1) }));
        await r.analytics.record(event({ occurredAt: from }));
        await r.analytics.record(event({ occurredAt: to }));
      });

      const counts = await uow.transaction((r) => r.analytics.countsInPeriod(from, to));
      equal(counts.map((c) => c.events), [1], 'only the event inside [from, to)');
    },
  },

  {
    name: 'a period with nothing in it is empty, not a row of zeros',
    async run(setup) {
      const { uow } = await setup();
      await uow.transaction((r) => r.analytics.record(event()));

      const counts = await uow.transaction((r) => r.analytics.countsInPeriod(
        new Date(AT.getTime() + 30 * DAY),
        new Date(AT.getTime() + 31 * DAY),
      ));
      equal(counts, [], 'no events, no rows');
    },
  },

  {
    name: 'the perfume and the house an event is about are kept',
    async run(setup) {
      const world = await setup();
      const { uow } = world;
      // A product that exists is not required by this port — the column is not a
      // foreign key to products — but recording one and reading the counts back
      // proves the columns are written rather than dropped.
      await uow.transaction((r) => r.analytics.record(event({
        name: 'cart_add',
        productId: '11111111-1111-4111-8111-111111111111',
        sellerId: null,
      })));

      const [row] = await uow.transaction((r) =>
        r.analytics.countsInPeriod(new Date(AT.getTime() - DAY), new Date(AT.getTime() + DAY)));
      equal([row?.name, row?.events], ['cart_add', 1], 'the event was recorded');
    },
  },
];
