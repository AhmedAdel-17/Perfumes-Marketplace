/**
 * The audit trail's READ contract, run against every adapter.
 *
 * Until the console had a screen for the trail, `recent` was called with one
 * entity at a time and a handful of rows, and nothing depended on its ordering
 * beyond "newest first, roughly". A screen that PAGES through the trail depends
 * on much more: a total order, a cursor that means the same thing to Postgres
 * and to memory, and a filter that narrows without disturbing either.
 *
 * The case that matters most is the one a single-adapter test would never
 * write: entries recorded inside ONE transaction. Postgres stamps them with the
 * same `now()`, to the microsecond, so any ordering or cursor built on the time
 * alone repeats or loses them at a page boundary — silently, and only in the
 * adapter that runs in production.
 */
import type { UnitOfWork } from './repositories';
import type { AuditAction, AuditEntry } from './audit-trail';

export interface AuditContractWorld {
  readonly uow: UnitOfWork;
}

export interface AuditContractCase {
  readonly name: string;
  readonly run: (harness: () => Promise<AuditContractWorld>) => Promise<void>;
}

const fail = (message: string): never => {
  throw new Error(message);
};

const entry = (action: AuditAction, note: string): AuditEntry => ({
  action,
  actorId: null,
  actorLabel: 'مشغّلة المنصّة',
  entityTable: 'sellers',
  entityId: null,
  after: JSON.stringify({ note }),
  note,
});

/** A valid uuid that names no entry, so both adapters can be asked about it. */
const NOWHERE = '00000000-0000-4000-8000-000000000000';

/**
 * Seven entries in three transactions: two decisions that each wrote several
 * entries at once, and one that wrote one. The shape a real payout or a house
 * going live produces.
 */
async function seed(uow: UnitOfWork): Promise<void> {
  await uow.transaction(async (r) => {
    await r.audit.record(entry('verification_decision', 'a1'));
    await r.audit.record(entry('verification_decision', 'a2'));
    await r.audit.record(entry('seller_status_change', 'a3'));
  });
  await uow.transaction(async (r) => {
    await r.audit.record(entry('payout_approval', 'b1'));
  });
  await uow.transaction(async (r) => {
    await r.audit.record(entry('verification_decision', 'c1'));
    await r.audit.record(entry('payout_adjustment', 'c2'));
    await r.audit.record(entry('verification_decision', 'c3'));
  });
}

/** Every page of a query, following the cursor, as a flat list of ids. */
async function pageThrough(
  uow: UnitOfWork,
  query: { action?: AuditAction },
  size: number,
): Promise<string[]> {
  const seen: string[] = [];
  let before: string | undefined;
  // A bound on the loop, so a cursor that never advances fails rather than hangs.
  for (let page = 0; page < 50; page += 1) {
    const rows = await uow.transaction((r) => r.audit.recent({
      ...query,
      ...(before === undefined ? {} : { before }),
      limit: size,
    }));
    if (rows.length === 0) return seen;
    seen.push(...rows.map((row) => row.id));
    before = rows[rows.length - 1]!.id;
  }
  return fail('the cursor never reached the end of the trail');
}

export const auditContract: readonly AuditContractCase[] = [
  {
    name: 'returns every entry newest first, the last transaction on top',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      const rows = await uow.transaction((r) => r.audit.recent());
      if (rows.length !== 7) fail(`expected 7 entries, got ${rows.length}`);

      // Transaction order is observable even where entry order within one is
      // not: all of the last decision's entries come before any of the first's.
      const notes = rows.map((row) => row.note);
      const firstOfC = Math.max(...['c1', 'c2', 'c3'].map((n) => notes.indexOf(n)));
      const firstOfA = Math.min(...['a1', 'a2', 'a3'].map((n) => notes.indexOf(n)));
      if (firstOfC > 2) fail(`the newest transaction is not on top: ${notes.join(',')}`);
      if (firstOfA < 4) fail(`the oldest transaction is not at the bottom: ${notes.join(',')}`);

      for (let i = 1; i < rows.length; i += 1) {
        if (rows[i]!.occurredAt.getTime() > rows[i - 1]!.occurredAt.getTime()) {
          fail(`entry ${i} is newer than the one above it`);
        }
      }
    },
  },

  {
    name: 'gives the SAME order on every read, including entries that share an instant',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      // Without a tiebreak, entries stamped with one `now()` come back in
      // whatever order the planner chooses — and a cursor cannot page through
      // an order that changes between requests.
      const first = (await uow.transaction((r) => r.audit.recent())).map((row) => row.id);
      const second = (await uow.transaction((r) => r.audit.recent())).map((row) => row.id);
      if (first.join() !== second.join()) fail('two reads of an unchanged trail disagreed on order');
    },
  },

  {
    name: 'pages through the whole trail with no entry repeated and none lost',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      const whole = (await uow.transaction((r) => r.audit.recent())).map((row) => row.id);

      // Page sizes that put a boundary INSIDE a multi-entry transaction, which
      // is exactly where a time-only cursor repeats or skips.
      for (const size of [1, 2, 3]) {
        const paged = await pageThrough(uow, {}, size);
        if (new Set(paged).size !== paged.length) fail(`page size ${size} repeated an entry`);
        if (paged.join() !== whole.join()) {
          fail(`page size ${size} did not reproduce the trail: ${paged.length} of ${whole.length}`);
        }
      }
    },
  },

  {
    name: 'narrows to one kind of decision',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      const rows = await uow.transaction((r) => r.audit.recent({ action: 'verification_decision' }));
      if (rows.length !== 4) fail(`expected 4 verification decisions, got ${rows.length}`);
      if (rows.some((row) => row.action !== 'verification_decision')) {
        fail('the filter let another kind of decision through');
      }
    },
  },

  {
    name: 'pages through a narrowed trail without leaving the filter',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      const whole = (await uow.transaction((r) => r.audit.recent({ action: 'verification_decision' })))
        .map((row) => row.id);
      const paged = await pageThrough(uow, { action: 'verification_decision' }, 1);
      if (paged.join() !== whole.join()) fail('paging a filtered trail changed what it contained');
    },
  },

  {
    name: 'honours the limit',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      const rows = await uow.transaction((r) => r.audit.recent({ limit: 2 }));
      if (rows.length !== 2) fail(`limit 2 returned ${rows.length}`);
    },
  },

  {
    name: 'a cursor that names no entry returns nothing, not the whole trail',
    run: async (harness) => {
      const { uow } = await harness();
      await seed(uow);

      // The dangerous failure is the generous one: a stale or foreign cursor
      // quietly treated as "from the top" shows page one again under a
      // heading that says it is page three.
      const rows = await uow.transaction((r) => r.audit.recent({ before: NOWHERE }));
      if (rows.length !== 0) fail(`an unknown cursor returned ${rows.length} entries`);
    },
  },
];
