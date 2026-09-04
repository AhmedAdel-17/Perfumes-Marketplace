/**
 * Content repository contract.
 *
 * The same cases run against the in-memory fake and the Drizzle adapter. An
 * in-memory double nobody holds to a contract is a double that agrees with
 * itself and with nothing else — and every domain test that uses it inherits
 * that agreement as if it meant something.
 *
 * Framework-free, like `repository-contract.ts`, so it can live inside the
 * domain without breaking the dependency rule.
 */
import type { Block } from '../content/blocks';
import type { UnitOfWork } from './repositories';

export interface ContentContractWorld {
  readonly uow: UnitOfWork;
  /** A platform staff id that may be recorded as a revision's author. */
  readonly staffId: string;
}

export type ContentHarness = () => Promise<ContentContractWorld>;

export interface ContentContractCase {
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

const draft = (text: string): Block[] => [
  { kind: 'heading', level: 2, text },
  { kind: 'passage', text: `${text} — نص` },
];

export const contentContract: readonly ContentContractCase[] = [
  {
    name: 'a new page is a draft, serving nothing',
    async run(setup) {
      const { uow } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));

      equal(page.state, 'draft', 'the state of a new page');
      equal(page.publishedRevisionId, null, 'the revision a new page serves');
      equal(await uow.transaction((r) => r.content.findLive('about')), null, 'what a visitor sees');
    },
  },

  {
    name: 'a draft is found by slug and by id, and is not live',
    async run(setup) {
      const { uow } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'care', title: 'العناية' }));

      const bySlug = await uow.transaction((r) => r.content.findBySlug('care'));
      const byId = await uow.transaction((r) => r.content.findById(page.id));
      equal(bySlug?.id, page.id, 'lookup by slug');
      equal(byId?.slug, 'care', 'lookup by id');
      equal(await uow.transaction((r) => r.content.listLive()), [], 'the live directory');
    },
  },

  {
    name: 'publishing freezes the draft and serves it',
    async run(setup) {
      const { uow, staffId } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));
      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عن ديار', blocks: draft('من نحن'),
      }));
      await uow.transaction((r) => r.content.publish(page.id, staffId));

      const live = await uow.transaction((r) => r.content.findLive('about'));
      assert(live !== null, 'the page must be live after publishing');
      equal(live!.title, 'عن ديار', 'the served title');
      equal(live!.blocks.length, 2, 'the served block count');
    },
  },

  {
    name: 'editing a published page does NOT change what is served',
    async run(setup) {
      /*
       * The single most important case in this file, and the one an adapter is
       * most likely to get wrong by reading `draft_blocks` on the public path.
       * An editor typing must not reach a visitor.
       */
      const { uow, staffId } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));
      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عن ديار', blocks: draft('النسخة المنشورة'),
      }));
      await uow.transaction((r) => r.content.publish(page.id, staffId));

      // Now somebody starts editing.
      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عنوان جديد لم يُنشر', blocks: draft('كلام غير مكتمل'),
      }));
      await uow.transaction((r) => r.content.setState(page.id, 'draft'));

      const live = await uow.transaction((r) => r.content.findLive('about'));
      assert(live !== null, 'a page being edited must stay live');
      equal(live!.title, 'عن ديار', 'the served title while editing');
      assert(
        JSON.stringify(live!.blocks).includes('النسخة المنشورة'),
        'the served blocks must be the published ones, not the draft',
      );
    },
  },

  {
    name: 'publishing again serves the new revision and keeps the old one',
    async run(setup) {
      const { uow, staffId } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));

      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عن ديار', blocks: draft('الأولى'),
      }));
      await uow.transaction((r) => r.content.publish(page.id, staffId));

      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عن ديار', blocks: draft('الثانية'),
      }));
      await uow.transaction((r) => r.content.publish(page.id, staffId));

      const live = await uow.transaction((r) => r.content.findLive('about'));
      assert(JSON.stringify(live!.blocks).includes('الثانية'), 'the newest revision is served');

      const history = await uow.transaction((r) => r.content.revisions(page.id));
      equal(history.length, 2, 'revisions kept');
      // Newest first — a history in the other order reads as a timeline running
      // backwards, and the console shows the top entry as "current".
      assert(
        JSON.stringify(history[0]!.blocks).includes('الثانية'),
        'history must be newest first',
      );
    },
  },

  {
    name: 'archiving takes a page off the site without deleting it',
    async run(setup) {
      const { uow, staffId } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'retired', title: 'قديمة' }));
      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'قديمة', blocks: draft('محتوى'),
      }));
      await uow.transaction((r) => r.content.publish(page.id, staffId));
      await uow.transaction((r) => r.content.setState(page.id, 'archived'));

      equal(await uow.transaction((r) => r.content.findLive('retired')), null, 'an archived page');
      equal(await uow.transaction((r) => r.content.listLive()), [], 'the live directory');

      // Still there for the console, and still holding its history.
      const still = await uow.transaction((r) => r.content.findById(page.id));
      assert(still !== null, 'an archived page must still exist');
      equal((await uow.transaction((r) => r.content.revisions(page.id))).length, 1, 'its history');
    },
  },

  {
    name: 'the live directory lists published titles, not draft ones',
    async run(setup) {
      const { uow, staffId } = await setup();
      const live = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));
      await uow.transaction((r) => r.content.saveDraft(live.id, {
        title: 'عن ديار', blocks: draft('محتوى'),
      }));
      await uow.transaction((r) => r.content.publish(live.id, staffId));
      // Renamed after publishing, and not republished.
      await uow.transaction((r) => r.content.saveDraft(live.id, {
        title: 'اسم جديد', blocks: draft('محتوى'),
      }));

      await uow.transaction((r) => r.content.create({ slug: 'hidden', title: 'مسودة' }));

      equal(
        await uow.transaction((r) => r.content.listLive()),
        [{ slug: 'about', title: 'عن ديار' }],
        'the live directory',
      );
    },
  },

  {
    name: 'a revision records who published it',
    async run(setup) {
      const { uow, staffId } = await setup();
      const page = await uow.transaction((r) => r.content.create({ slug: 'about', title: 'عن ديار' }));
      await uow.transaction((r) => r.content.saveDraft(page.id, {
        title: 'عن ديار', blocks: draft('محتوى'),
      }));
      const revision = await uow.transaction((r) => r.content.publish(page.id, staffId));
      equal(revision.publishedBy, staffId, 'the recorded author');
    },
  },

  {
    name: 'an unknown slug is null, not an error',
    async run(setup) {
      const { uow } = await setup();
      equal(await uow.transaction((r) => r.content.findLive('nothing-here')), null, 'a missing page');
      equal(await uow.transaction((r) => r.content.findBySlug('nothing-here')), null, 'by slug');
    },
  },
];
