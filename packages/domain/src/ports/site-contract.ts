/**
 * Site repository contract.
 *
 * Run against the in-memory fake and the Drizzle adapter, like every other
 * port here. The case that earns this file is the WINDOW BOUNDARY: half-open
 * is stated in three places — this contract, the SQL predicate, and the
 * domain's `showing` — and three copies of one boundary rule is three chances
 * to disagree about the instant a window closes.
 */
import type { UnitOfWork } from './repositories';

export interface SiteContractWorld {
  readonly uow: UnitOfWork;
  /** A platform staff id an announcement can be attributed to. */
  readonly staffId: string;
}

export type SiteHarness = () => Promise<SiteContractWorld>;

export interface SiteContractCase {
  readonly name: string;
  run(setup: SiteHarness): Promise<void>;
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

const NOW = new Date('2026-09-04T12:00:00.000Z');
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

export const siteContract: readonly SiteContractCase[] = [
  {
    name: 'nothing is showing on an empty site',
    async run(setup) {
      const { uow } = await setup();
      equal(await uow.transaction((r) => r.site.currentAnnouncements(NOW)), [], 'current');
    },
  },

  {
    name: 'an announcement in window is current, and is attributable',
    async run(setup) {
      const { uow, staffId } = await setup();
      const posted = await uow.transaction((r) => r.site.post({
        message: 'التوصيل متأخر', href: null,
        startsAt: at(-1), endsAt: at(24), createdBy: staffId,
      }));

      const current = await uow.transaction((r) => r.site.currentAnnouncements(NOW));
      equal(current.length, 1, 'current announcements');
      equal(current[0]!.id, posted.id, 'the current one');
      equal(current[0]!.message, 'التوصيل متأخر', 'the message');
    },
  },

  {
    name: 'a scheduled announcement is NOT current',
    async run(setup) {
      // A plan readable by anyone who asks is a plan that leaks: "free delivery
      // from Sunday" showing on Thursday is a discount announced three days
      // early to whoever happened to be looking.
      const { uow, staffId } = await setup();
      await uow.transaction((r) => r.site.post({
        message: 'توصيل مجاني', href: null,
        startsAt: at(48), endsAt: at(72), createdBy: staffId,
      }));

      equal(await uow.transaction((r) => r.site.currentAnnouncements(NOW)), [], 'current');
      equal((await uow.transaction((r) => r.site.allAnnouncements())).length, 1, 'scheduled');
    },
  },

  {
    name: 'the window is half-open at both ends',
    async run(setup) {
      /*
       * The instant a window ends, it is over. The instant one starts, it has
       * begun. Otherwise a notice ending at noon and one starting at noon are
       * both live for the same millisecond, and which one shows depends on
       * whichever comparison a given layer happened to write.
       */
      const { uow, staffId } = await setup();
      await uow.transaction((r) => r.site.post({
        message: 'انتهى الآن', href: null,
        startsAt: at(-2), endsAt: NOW, createdBy: staffId,
      }));
      await uow.transaction((r) => r.site.post({
        message: 'يبدأ الآن', href: null,
        startsAt: NOW, endsAt: at(2), createdBy: staffId,
      }));

      const current = await uow.transaction((r) => r.site.currentAnnouncements(NOW));
      equal(current.length, 1, 'announcements live at the boundary instant');
      equal(current[0]!.message, 'يبدأ الآن', 'the one that is live');
    },
  },

  {
    name: 'overlapping announcements come back newest-begun first',
    async run(setup) {
      const { uow, staffId } = await setup();
      await uow.transaction((r) => r.site.post({
        message: 'رمضان', href: null,
        startsAt: at(-120), endsAt: at(120), createdBy: staffId,
      }));
      await uow.transaction((r) => r.site.post({
        message: 'تأخير', href: null,
        startsAt: at(-2), endsAt: at(24), createdBy: staffId,
      }));

      const current = await uow.transaction((r) => r.site.currentAnnouncements(NOW));
      equal(current.length, 2, 'both are live');
      // The ORDER is part of the contract: the site takes the first, and the
      // domain's `showing` picks the most recently begun. They have to agree.
      equal(current[0]!.message, 'تأخير', 'the first one returned');
    },
  },

  {
    name: 'ending one takes it down without deleting it',
    async run(setup) {
      const { uow, staffId } = await setup();
      const posted = await uow.transaction((r) => r.site.post({
        message: 'خطأ', href: null,
        startsAt: at(-1), endsAt: at(24), createdBy: staffId,
      }));

      equal(await uow.transaction((r) => r.site.endAnnouncement(posted.id, NOW)), true, 'ended');
      equal(await uow.transaction((r) => r.site.currentAnnouncements(NOW)), [], 'current after');
      // Still on the record. What the site said, and when, is answerable.
      equal((await uow.transaction((r) => r.site.allAnnouncements())).length, 1, 'kept');
    },
  },

  {
    name: 'ending one that has not started yet does nothing',
    async run(setup) {
      // It would put the end before the start, which the database refuses
      // outright — so this has to be a reportable no-op rather than a raw
      // constraint error surfacing on a button press.
      const { uow, staffId } = await setup();
      const posted = await uow.transaction((r) => r.site.post({
        message: 'لاحقًا', href: null,
        startsAt: at(24), endsAt: at(48), createdBy: staffId,
      }));

      equal(await uow.transaction((r) => r.site.endAnnouncement(posted.id, NOW)), false, 'ended');
      const still = await uow.transaction((r) => r.site.allAnnouncements());
      equal(still[0]!.endsAt.toISOString(), at(48).toISOString(), 'the untouched window');
    },
  },

  {
    name: 'ending an unknown announcement does nothing',
    async run(setup) {
      const { uow } = await setup();
      equal(
        await uow.transaction(
          (r) => r.site.endAnnouncement('00000000-0000-4000-8000-000000000000', NOW),
        ),
        false,
        'ending nothing',
      );
    },
  },

  {
    name: 'curation starts empty and reads back what was set',
    async run(setup) {
      const { uow, staffId } = await setup();
      const before = await uow.transaction((r) => r.site.curation());
      equal(before.heroProductId, null, 'the hero before curation');
      equal(before.featuredProductIds, [], 'the featured list before curation');

      await uow.transaction((r) => r.site.setCuration({
        heroProductId: null, featuredProductIds: [], updatedBy: staffId,
      }));
      equal((await uow.transaction((r) => r.site.curation())).heroProductId, null, 'unchanged');
    },
  },
];
