/**
 * Review repository contract.
 *
 * Run against the in-memory fake and the Drizzle adapter, like every other port
 * here. Two things earn this file rather than a pair of adapter tests.
 *
 * The first is the AUTHORISATION SHAPE. "A guest may review only what they
 * received" is enforced in the in-memory adapter by a filter and in Postgres by
 * a join plus a trigger, and those are different enough that agreeing by
 * accident is not plausible. If both refuse a line item belonging to somebody
 * else's order, the refusal is in the contract.
 *
 * The second is MASKING. A public review carries a name, and the rule that it
 * is a given name and an initial has to hold in both implementations or the
 * customer's full name leaks from whichever one forgot.
 */
import type { UnitOfWork } from './repositories';
import type { Clock } from './clock';
import {
  SubOrderLifecycle, type Actor, type SubOrderState,
} from '../state-machines/sub-order';
import { REVIEW_DIMENSIONS, publicAuthorName, type Ratings } from '../trust/review';

/** An order the world has already placed, with the two factors that open it. */
export interface ContractOrder {
  readonly reference: string;
  readonly phone: string;
}

export interface ReviewContractWorld {
  readonly uow: UnitOfWork;
  /**
   * Two DELIVERED orders, placed on different phones, both containing the same
   * perfume.
   *
   * Two are needed rather than one with two lines: a line item can be reviewed
   * exactly once, so averaging across reviews of one product requires two
   * separate purchases of it — which is also the only way it happens in life.
   */
  readonly first: ContractOrder;
  readonly second: ContractOrder;
  /** Placed, not delivered. Nothing in it may be reviewed. */
  readonly undelivered: ContractOrder;
  /**
   * The full name the FIRST order was placed under.
   *
   * The contract needs it to assert the masking exactly rather than by shape:
   * a regex saying "something, space, letter, dot" is satisfied by a byline
   * that leaked the surname of a two-part name and by the fallback used when
   * no customer row was found at all. Both went past an earlier version of
   * this case.
   */
  readonly buyerName: string;
  /**
   * Change the FIRST order's customer's name.
   *
   * Exists for exactly one case: proving the byline on an existing review does
   * not move when it happens. The alternative implementation — joining the
   * customer at read time — passes every other case in this file and silently
   * rewrites the name under a review somebody wrote two years ago.
   */
  renameBuyer(fullName: string): Promise<void>;
  /** A platform staff id a moderation action can be attributed to. */
  readonly moderatorId: string;
}

export type ReviewHarness = () => Promise<ReviewContractWorld>;

/**
 * Walk a sub-order from `placed` to `delivered`, through every state in
 * between.
 *
 * Exported because BOTH harnesses need it and neither should own it. Building
 * the world by writing `state = 'delivered'` directly would skip the state
 * machine, the transition rows and — in Postgres — the trigger in 0001 that
 * refuses the jump; the fixture would then prove reviews work on orders that
 * cannot exist.
 */
export async function walkToDelivered(
  uow: UnitOfWork,
  subOrderId: string,
  clock: Clock,
): Promise<void> {
  const steps: readonly (readonly [SubOrderState, SubOrderState, Actor])[] = [
    ['placed', 'awaiting_seller', 'system'],
    ['awaiting_seller', 'confirmed', 'seller'],
    ['confirmed', 'dispatched', 'seller'],
    ['dispatched', 'delivered', 'platform'],
  ];

  for (const [from, to, actor] of steps) {
    await uow.transaction(async (r) => {
      const record = SubOrderLifecycle.transition(from, { to, actor }, clock);
      await r.subOrders.applyTransition(subOrderId, to, actor, null, record);
    });
  }
}

export interface ReviewContractCase {
  readonly name: string;
  run(setup: ReviewHarness): Promise<void>;
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

const NOW = new Date('2026-09-08T10:00:00.000Z');

const rate = (value: number, overrides: Partial<Ratings> = {}): Ratings => ({
  scent: value, longevity: value, projection: value,
  value, packaging: value, descriptionAccuracy: value,
  ...overrides,
});

export const reviewContract: readonly ReviewContractCase[] = [
  {
    name: 'a delivered line item is reviewable, and names the perfume',
    async run(setup) {
      const { uow, first } = await setup();
      const lines = await uow.transaction((r) => r.reviews.listReviewable(first));

      assert(lines.length > 0, 'a delivered order must offer something to review');
      const line = lines[0]!;
      assert(line.productName.length > 0, 'the perfume must be named');
      assert(line.brandName.length > 0, 'the house must be named');
      assert(line.productSlug.length > 0, 'the slug is how the screen links back to it');
      equal(line.reviewed, false, 'a fresh line item');
    },
  },

  {
    name: 'an order that has not arrived has nothing to review',
    async run(setup) {
      const { uow, undelivered } = await setup();
      // Offering a form the database will refuse is worse than offering none:
      // the customer writes three paragraphs and then sees an error.
      equal(await uow.transaction((r) => r.reviews.listReviewable(undelivered)), [],
        'reviewable lines on an undelivered order');
    },
  },

  {
    name: 'the WRONG PHONE reveals nothing, exactly as an unknown reference does',
    async run(setup) {
      const { uow, first, second } = await setup();
      equal(
        await uow.transaction((r) => r.reviews.listReviewable({
          reference: first.reference, phone: second.phone,
        })),
        [],
        'reviewable lines for a mismatched phone',
      );
      equal(
        await uow.transaction((r) => r.reviews.listReviewable({
          reference: 'DY-NOTHING', phone: first.phone,
        })),
        [],
        'reviewable lines for an unknown reference',
      );
    },
  },

  {
    name: 'a review is recorded, and the line stops being offered',
    async run(setup) {
      const { uow, first } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));

      const recorded = await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(5), body: 'ثبات ممتاز', incentiveDisclosed: false, now: NOW,
      }));
      assert(recorded !== null, 'recording a review of a delivered purchase');
      equal(recorded!.productSlug, line!.productSlug, 'the slug the screen returns to');

      const after = await uow.transaction((r) => r.reviews.listReviewable(first));
      const same = after.find((l) => l.lineItemId === line!.lineItemId);
      assert(same !== undefined, 'the line is still listed');
      equal(same!.reviewed, true, 'the line after being reviewed');
    },
  },

  {
    name: 'the SAME LINE ITEM cannot be reviewed twice',
    async run(setup) {
      const { uow, first } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      const write = () => uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(4), body: null, incentiveDisclosed: false, now: NOW,
      }));

      assert(await write() !== null, 'the first review');
      // Not an error: the customer who double-taps has not done anything wrong,
      // and the second attempt must not overwrite the first with a blank body.
      equal(await write(), null, 'the second review of one purchase');
    },
  },

  {
    name: 'ANOTHER ORDER’S line item cannot be reviewed with these factors',
    async run(setup) {
      const { uow, first, second } = await setup();
      const [theirs] = await uow.transaction((r) => r.reviews.listReviewable(second));

      /*
       * The case the whole port shape exists for.
       *
       * Nothing about identity comes from the request except the line item, and
       * a line item belonging to somebody else's order matches no row. There is
       * no comparison here that a refactor could drop, which is what went wrong
       * the first time order lookup was written.
       */
      equal(
        await uow.transaction((r) => r.reviews.record({
          ...first, lineItemId: theirs!.lineItemId,
          ratings: rate(1), body: 'مزيّف', incentiveDisclosed: false, now: NOW,
        })),
        null,
        'reviewing a stranger’s purchase',
      );

      // And it is still reviewable by the person who actually bought it.
      const lines = await uow.transaction((r) => r.reviews.listReviewable(second));
      equal(lines.find((l) => l.lineItemId === theirs!.lineItemId)!.reviewed, false,
        'the rightful owner’s line');
    },
  },

  {
    name: 'a recorded review appears on the product, with the name MASKED',
    async run(setup) {
      const { uow, first, buyerName } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(4, { descriptionAccuracy: 2 }),
        body: 'الوصف مبالغ فيه قليلًا', incentiveDisclosed: false, now: NOW,
      }));

      const published = await uow.transaction((r) => r.reviews.listForProduct({
        productId: line!.productId, limit: 20,
      }));
      equal(published.length, 1, 'published reviews');
      equal(published[0]!.body, 'الوصف مبالغ فيه قليلًا', 'the body as written');
      equal(published[0]!.ratings.descriptionAccuracy, 2, 'the accuracy score');

      /*
       * The masking rule, asserted in the contract because it exists in the
       * domain and is applied by each adapter. A full legal name printed under
       * a review is a customer's identity published next to what they bought.
       */
      const name = published[0]!.authorName;
      equal(name, publicAuthorName(buyerName), 'the byline');
      // And said the other way round, because the point is the leak rather
      // than the format: nothing after the given name survives as a word.
      for (const part of buyerName.trim().split(/\s+/).slice(1)) {
        assert(!name.includes(part), `the byline leaked "${part}"`);
      }
    },
  },

  {
    name: 'the byline is a SNAPSHOT — renaming the customer does not rewrite it',
    async run(setup) {
      const { uow, first, buyerName, renameBuyer } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(4), body: null, incentiveDisclosed: false, now: NOW,
      }));

      const before = (await uow.transaction((r) => r.reviews.listForProduct({
        productId: line!.productId, limit: 5,
      })))[0]!.authorName;
      equal(before, publicAuthorName(buyerName), 'the byline as written');

      await renameBuyer('سلمى عبد الله');

      const after = (await uow.transaction((r) => r.reviews.listForProduct({
        productId: line!.productId, limit: 5,
      })))[0]!.authorName;
      // A review is a statement somebody made on a date, and the name under it
      // is part of that statement. It is also why an anonymous visitor can read
      // reviews at all: nothing joins `customers`, which has no public policy.
      equal(after, before, 'the byline after the customer was renamed');
    },
  },

  {
    name: 'the summary averages every dimension across separate purchases',
    async run(setup) {
      const { uow, first, second } = await setup();

      const mine = await uow.transaction((r) => r.reviews.listReviewable(first));
      const theirs = await uow.transaction((r) => r.reviews.listReviewable(second));
      // The same perfume, bought twice. Found by product, not by position.
      const shared = mine.find((m) => theirs.some((t) => t.productId === m.productId))!;
      const other = theirs.find((t) => t.productId === shared.productId)!;

      await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: shared.lineItemId,
        ratings: rate(5, { descriptionAccuracy: 1 }),
        body: null, incentiveDisclosed: false, now: NOW,
      }));
      await uow.transaction((r) => r.reviews.record({
        ...second, lineItemId: other.lineItemId,
        ratings: rate(3, { descriptionAccuracy: 1 }),
        body: null, incentiveDisclosed: false, now: NOW,
      }));

      const summary = await uow.transaction((r) => r.reviews.summaryFor(shared.productId));
      equal(summary.count, 2, 'reviews counted');
      equal(summary.byDimension.scent, 4, 'the scent average');
      // The dimension that polices sellers survives intact rather than being
      // diluted by five good scores on the perfume itself.
      equal(summary.byDimension.descriptionAccuracy, 1, 'the accuracy average');

      for (const dimension of REVIEW_DIMENSIONS) {
        assert(summary.byDimension[dimension] !== null, `${dimension} must be averaged`);
      }
    },
  },

  {
    name: 'a product nobody has reviewed says NOTHING, not zero',
    async run(setup) {
      const { uow, first } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));

      const summary = await uow.transaction((r) => r.reviews.summaryFor(line!.productId));
      // "0.0 out of 5" on an unreviewed perfume is a page that has libelled it.
      equal(summary.count, 0, 'count');
      equal(summary.overall, null, 'overall');
      equal(summary.byDimension.scent, null, 'a dimension nobody has scored');
    },
  },

  {
    name: 'many products are summarised in one read, and the unreviewed are absent',
    async run(setup) {
      const { uow, first } = await setup();
      const lines = await uow.transaction((r) => r.reviews.listReviewable(first));
      const reviewed = lines[0]!;

      await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: reviewed.lineItemId,
        ratings: rate(4), body: null, incentiveDisclosed: false, now: NOW,
      }));

      const ids = lines.map((l) => l.productId);
      const map = await uow.transaction((r) => r.reviews.summariesFor(ids));

      assert(map.has(reviewed.productId), 'the reviewed product must be present');
      equal(map.get(reviewed.productId)!.count, 1, 'its count');
      // Absent rather than present-with-zero, so the caller substitutes the
      // value that means "nobody has said yet" instead of inventing a score.
      for (const id of ids.filter((i) => i !== reviewed.productId)) {
        equal(map.has(id), false, 'an unreviewed product in the map');
      }
    },
  },

  {
    name: 'an empty request returns an empty map rather than reading everything',
    async run(setup) {
      const { uow } = await setup();
      // `IN ()` is a syntax error in Postgres and `[].includes` is a full scan
      // in memory. A grid with no tiles must ask for nothing.
      equal((await uow.transaction((r) => r.reviews.summariesFor([]))).size, 0, 'map size');
    },
  },

  {
    name: 'HIDING removes it from the product page and from the average',
    async run(setup) {
      const { uow, first, moderatorId } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      const recorded = await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(1), body: 'شتيمة', incentiveDisclosed: false, now: NOW,
      }));

      equal(
        await uow.transaction((r) => r.reviews.hide({
          id: recorded!.id, note: 'لغة مسيئة', moderatorId, now: NOW,
        })),
        true,
        'hiding a review',
      );

      equal(
        (await uow.transaction((r) => r.reviews.listForProduct({
          productId: line!.productId, limit: 20,
        }))).length,
        0,
        'published reviews after hiding',
      );
      // An average that still counts a hidden review is an average that
      // punishes a house for something the platform decided nobody should read.
      equal(await uow.transaction((r) => r.reviews.summaryFor(line!.productId)),
        { count: 0, overall: null, byDimension: {
          scent: null, longevity: null, projection: null,
          value: null, packaging: null, descriptionAccuracy: null } },
        'the summary after hiding');
    },
  },

  {
    name: 'a hidden review is NOT DELETED, and says who removed it and why',
    async run(setup) {
      const { uow, first, moderatorId } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      const recorded = await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(2), body: 'رأي قاسٍ', incentiveDisclosed: false, now: NOW,
      }));
      await uow.transaction((r) => r.reviews.hide({
        id: recorded!.id, note: 'يخالف السياسة', moderatorId, now: NOW,
      }));

      /*
       * Doc 04 §3: "Brands cannot delete or privately suppress negative
       * reviews." Neither, in the end, can we — a hidden row keeps its ratings,
       * its body, and a note naming the operator who removed it.
       */
      const queue = await uow.transaction((r) => r.reviews.listForModeration({ limit: 50 }));
      const row = queue.find((q) => q.id === recorded!.id);
      assert(row !== undefined, 'a hidden review must remain in the record');
      equal(row!.body, 'رأي قاسٍ', 'the body of a hidden review');
      equal(row!.moderationNote, 'يخالف السياسة', 'the note');
      assert(row!.hiddenAt !== null, 'the hidden timestamp');
      assert(row!.productName.length > 0, 'the queue names the perfume');
    },
  },

  {
    name: 'restoring puts it back; hiding twice does not',
    async run(setup) {
      const { uow, first, moderatorId } = await setup();
      const [line] = await uow.transaction((r) => r.reviews.listReviewable(first));
      const recorded = await uow.transaction((r) => r.reviews.record({
        ...first, lineItemId: line!.lineItemId,
        ratings: rate(3), body: null, incentiveDisclosed: false, now: NOW,
      }));

      await uow.transaction((r) => r.reviews.hide({
        id: recorded!.id, note: 'مراجعة', moderatorId, now: NOW,
      }));
      // False rather than an overwrite: a second hide would replace the note
      // explaining the first, which is the record of why criticism was removed.
      equal(await uow.transaction((r) => r.reviews.hide({
        id: recorded!.id, note: 'سبب آخر', moderatorId, now: NOW,
      })), false, 'hiding an already hidden review');

      equal(await uow.transaction((r) => r.reviews.restore({
        id: recorded!.id, moderatorId, now: NOW,
      })), true, 'restoring');
      equal((await uow.transaction((r) => r.reviews.listForProduct({
        productId: line!.productId, limit: 20,
      }))).length, 1, 'published reviews after restoring');

      equal(await uow.transaction((r) => r.reviews.restore({
        id: recorded!.id, moderatorId, now: NOW,
      })), false, 'restoring one that is not hidden');
    },
  },

  {
    name: 'moderating something that does not exist changes nothing',
    async run(setup) {
      const { uow, moderatorId } = await setup();
      const absent = '00000000-0000-4000-8000-000000000000';
      equal(await uow.transaction((r) => r.reviews.hide({
        id: absent, note: 'أي شيء', moderatorId, now: NOW,
      })), false, 'hiding a review that does not exist');
      equal(await uow.transaction((r) => r.reviews.restore({
        id: absent, moderatorId, now: NOW,
      })), false, 'restoring a review that does not exist');
    },
  },
];
