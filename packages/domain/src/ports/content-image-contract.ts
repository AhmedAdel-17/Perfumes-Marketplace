/**
 * The content-image contract, run against every adapter.
 *
 * Reuses the content contract's world — a unit of work and an operator who can
 * be recorded as the uploader. Framework-free, like every contract here: each
 * case throws on failure.
 */
import type { ContentHarness } from './content-contract';
import type { NewContentImage } from './content-image-repository';

export interface ContentImageContractCase {
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

let sequence = 0;
const image = (uploadedBy: string, overrides: Partial<NewContentImage> = {}): NewContentImage => {
  sequence += 1;
  return {
    storageKey: `content/contract/${sequence.toString(16).padStart(24, '0')}.jpg`,
    contentType: 'image/jpeg',
    byteSize: 900_000,
    width: 2400,
    height: 1600,
    uploadedBy,
    ...overrides,
  };
};

const byKey = <T extends { storageKey: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => a.storageKey.localeCompare(b.storageKey));

export const contentImageContract: readonly ContentImageContractCase[] = [
  {
    name: 'a recorded image is found by its key, with every fact it was recorded with',
    async run(setup) {
      const { uow, staffId } = await setup();
      const wanted = image(staffId, { contentType: 'image/webp', byteSize: 512_345, width: 1800, height: 2700 });

      const recorded = await uow.transaction((r) => r.contentImages.record(wanted));
      equal(recorded, wanted, 'what record returns');

      const found = await uow.transaction((r) => r.contentImages.findByKeys([wanted.storageKey]));
      equal(found, [wanted], 'what findByKeys returns');
    },
  },

  {
    name: 'recording the same key twice keeps the first record and adds no second',
    async run(setup) {
      const { uow, staffId } = await setup();
      const first = image(staffId);

      await uow.transaction((r) => r.contentImages.record(first));
      // Different facts under the same key: a retry cannot rewrite what the
      // server read from the bytes the first time.
      const again = await uow.transaction((r) => r.contentImages.record({ ...first, width: 999, height: 999 }));

      equal(again, first, 'the second record call returns the first record');
      const found = await uow.transaction((r) => r.contentImages.findByKeys([first.storageKey]));
      equal(found, [first], 'exactly one record, unchanged');
    },
  },

  {
    name: 'findByKeys returns only recorded keys, matched exactly',
    async run(setup) {
      const { uow, staffId } = await setup();
      const a = image(staffId);
      const b = image(staffId);
      await uow.transaction(async (r) => {
        await r.contentImages.record(a);
        await r.contentImages.record(b);
      });

      const found = await uow.transaction((r) => r.contentImages.findByKeys([
        b.storageKey,
        a.storageKey,
        'content/contract/ffffffffffffffffffffffff.jpg',
        // A prefix of a real key is not that key. A LIKE where an = belongs
        // would find `a` here.
        a.storageKey.slice(0, -4),
      ]));
      equal(byKey(found), byKey([a, b]), 'the two recorded keys, nothing else');
    },
  },

  {
    name: 'findByKeys survives an empty list',
    async run(setup) {
      const { uow } = await setup();
      // `IN ()` is a Postgres syntax error: a page with no image blocks must not
      // be the request that takes the renderer down.
      equal(await uow.transaction((r) => r.contentImages.findByKeys([])), [], 'empty request, empty answer');
    },
  },
];
