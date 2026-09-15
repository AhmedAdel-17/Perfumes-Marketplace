/**
 * The photograph contract, run against every adapter.
 *
 * Reuses the repository contract's world — two houses, a product each — so the
 * photographs hang off rows both harnesses already build. Framework-free, like
 * every contract here: each case throws on failure.
 */
import type { ContractHarness, ContractWorld } from './repository-contract';
import type { NewPhoto, StoredPhoto } from './photo-repository';

export interface PhotoContractCase {
  readonly name: string;
  run(setup: ContractHarness): Promise<void>;
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
const photo = (overrides: Partial<NewPhoto> = {}): NewPhoto => {
  sequence += 1;
  return {
    storageKey: `products/contract/${sequence.toString(16).padStart(24, '0')}.jpg`,
    alt: `زجاجة ${sequence}`,
    ownershipConfirmed: true,
    contentType: 'image/jpeg',
    byteSize: 2_400_000,
    width: 2400,
    height: 3000,
    ...overrides,
  };
};

const add = (w: ContractWorld, productId: string, overrides: Partial<NewPhoto> = {}) =>
  w.uow.transaction((r) => r.photos.add(productId, photo(overrides)));

const list = (w: ContractWorld, productId: string) =>
  w.uow.transaction((r) => r.photos.listForProduct(productId));

const primaries = (photos: readonly StoredPhoto[]) => photos.filter((p) => p.isPrimary).map((p) => p.id);

export const photoContract: readonly PhotoContractCase[] = [
  {
    name: 'the first photograph a product receives is its primary; the next ones are not',
    async run(setup) {
      const w = await setup();
      const first = await add(w, w.wardProductId);
      const second = await add(w, w.wardProductId);

      equal(first.isPrimary, true, 'first is primary');
      equal(second.isPrimary, false, 'second is not');
      assert(second.position > first.position, 'the second is placed after the first');
    },
  },

  {
    name: 'carries the facts read from the file, and the house’s description',
    async run(setup) {
      const w = await setup();
      const added = await add(w, w.wardProductId, {
        alt: 'ليل القاهرة على رخام', contentType: 'image/webp', byteSize: 812_345, width: 1600, height: 2000,
      });
      const [stored] = await list(w, w.wardProductId);

      equal(stored!.id, added.id, 'the listed photograph is the added one');
      equal(stored!.alt, 'ليل القاهرة على رخام', 'alt');
      equal(stored!.ownershipConfirmed, true, 'ownership');
      equal(stored!.contentType, 'image/webp', 'content type');
      equal(stored!.byteSize, 812_345, 'size');
      equal([stored!.width, stored!.height], [1600, 2000], 'dimensions');
      equal(stored!.productId, w.wardProductId, 'product');
    },
  },

  {
    name: 'lists in display order, and only that product’s photographs',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);
      const b = await add(w, w.wardProductId);
      await add(w, w.nourProductId);

      equal((await list(w, w.wardProductId)).map((p) => p.id), [a.id, b.id], 'ward, in order');
      equal((await list(w, w.nourProductId)).length, 1, 'nour has its own one');
    },
  },

  {
    name: 'making another photograph primary leaves exactly one primary',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);
      const b = await add(w, w.wardProductId);

      equal(await w.uow.transaction((r) => r.photos.makePrimary(b.id, w.wardProductId)), true, 'made primary');
      equal(primaries(await list(w, w.wardProductId)), [b.id], 'only b is primary');
      assert(a.id !== b.id, 'distinct photographs');
    },
  },

  {
    name: 'refuses to act on a photograph through a product it does not belong to',
    async run(setup) {
      /*
       * A valid photograph id from Nour's product, named under Ward's. Row-level
       * security would stop a house reaching Nour's rows at all; this is the
       * adapter's own half — an id only ever means something WITH its product.
       */
      const w = await setup();
      await add(w, w.wardProductId);
      const nours = await add(w, w.nourProductId);

      equal(await w.uow.transaction((r) => r.photos.makePrimary(nours.id, w.wardProductId)), false, 'makePrimary');
      equal(await w.uow.transaction((r) => r.photos.describe(nours.id, w.wardProductId,
        { alt: 'x', ownershipConfirmed: true })), false, 'describe');
      equal(await w.uow.transaction((r) => r.photos.remove(nours.id, w.wardProductId)), null, 'remove');
      equal((await list(w, w.nourProductId)).length, 1, 'nour’s photograph is untouched');
    },
  },

  {
    name: 'reordering persists',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);
      const b = await add(w, w.wardProductId);
      const c = await add(w, w.wardProductId);

      await w.uow.transaction((r) => r.photos.reorder(w.wardProductId, [c.id, a.id, b.id]));
      equal((await list(w, w.wardProductId)).map((p) => p.id), [c.id, a.id, b.id], 'new order');
    },
  },

  {
    name: 'describing updates the alt text and the ownership confirmation',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);

      equal(await w.uow.transaction((r) => r.photos.describe(a.id, w.wardProductId,
        { alt: 'العلبة من الأمام', ownershipConfirmed: true })), true, 'described');
      const [stored] = await list(w, w.wardProductId);
      equal(stored!.alt, 'العلبة من الأمام', 'alt updated');
    },
  },

  {
    name: 'removing a primary promotes the next photograph, and returns what was removed',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);
      const b = await add(w, w.wardProductId);
      const c = await add(w, w.wardProductId);

      const removed = await w.uow.transaction((r) => r.photos.remove(a.id, w.wardProductId));
      equal(removed?.storageKey ?? null, a.storageKey, 'the removed row, so its file can be deleted');

      const after = await list(w, w.wardProductId);
      equal(after.map((p) => p.id), [b.id, c.id], 'the rest, in order');
      equal(primaries(after), [b.id], 'the next photograph is now primary');
    },
  },

  {
    name: 'removing the only photograph leaves none, and a listing with none has no primary image',
    async run(setup) {
      const w = await setup();
      const a = await add(w, w.wardProductId);
      equal(await w.uow.transaction((r) => r.listings.hasPrimaryImage(w.wardProductId)), true, 'before');

      await w.uow.transaction((r) => r.photos.remove(a.id, w.wardProductId));
      equal((await list(w, w.wardProductId)).length, 0, 'none left');
      equal(await w.uow.transaction((r) => r.listings.hasPrimaryImage(w.wardProductId)), false, 'after');
    },
  },

  {
    name: 'the cart snapshot carries the primary photograph, follows a change of primary, and is null without one',
    async run(setup) {
      const w = await setup();
      const snapshotPhoto = async () => {
        const [row] = await w.uow.transaction((r) => r.products.snapshotForCart([w.wardProductId]));
        assert(row !== undefined, 'the ward product must resolve');
        return row!.primaryPhoto;
      };

      equal(await snapshotPhoto(), null, 'no photograph yet');

      const a = await add(w, w.wardProductId, { width: 1200, height: 1500 });
      const b = await add(w, w.wardProductId);
      equal(await snapshotPhoto(), {
        storageKey: a.storageKey, alt: a.alt, width: 1200, height: 1500,
      }, 'the primary, with its facts');

      // The case a join on "any photograph" or "the first by position" would
      // get right by accident above, and wrong here.
      await w.uow.transaction((r) => r.photos.makePrimary(b.id, w.wardProductId));
      equal((await snapshotPhoto())?.storageKey ?? null, b.storageKey, 'follows the new primary');
    },
  },
];
