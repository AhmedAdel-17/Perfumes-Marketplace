/**
 * Port: a photograph's relief — its bottle lifted out of it (migration 0032).
 *
 * Its own port rather than more methods on `PhotoRepository`: photographs are
 * a house's, added and ordered by the house; a relief is the platform's,
 * made in the console by the content team (founder, 19 Oct 2026). Two writers,
 * two policies, two reasons to change.
 *
 * Exercised against real Postgres only (`packages/db/src/relief-repository.test.ts`),
 * like the glossary: who may read and write is the rule that matters, and it
 * lives in the database's row security — a fake would only prove the fake.
 */
import type { ReliefMethod, ReliefPlacement } from '../catalogue/relief';

export interface NewRelief {
  readonly mediaId: string;
  readonly cutoutKey: string;
  readonly reliefKey: string;
  /** Read from the files' own bytes; the same for both. */
  readonly width: number;
  readonly height: number;
  readonly cutoutBytes: number;
  readonly reliefBytes: number;
  readonly placement: ReliefPlacement;
  readonly method: ReliefMethod;
  readonly opaque: boolean;
  /** The `platform_staff` row of the operator who made it. */
  readonly madeBy: string;
}

export interface StoredRelief extends NewRelief {
  readonly madeAt: Date;
}

/** A product as the console's relief screen lists it: its primary photograph, and its relief if any. */
export interface ReliefOverviewRow {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly status: string;
  readonly mediaId: string;
  readonly photoKey: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
  readonly relief: StoredRelief | null;
}

export interface ReliefRepository {
  /**
   * Every product with a VERIFIED primary photograph, those without a relief
   * first — the console's work list. One product when `productId` is given.
   */
  overview(productId?: string): Promise<ReliefOverviewRow[]>;

  /** The relief of a photograph, or null. */
  forPhoto(mediaId: string): Promise<StoredRelief | null>;

  /**
   * The reliefs of many photographs, keyed by photograph: a page of perfume
   * cards reads them in one query, not one each (the reveal plays from a card
   * since 20 Oct 2026). A photograph absent from the map has no relief this
   * reader may see.
   */
  forPhotos(mediaIds: readonly string[]): Promise<ReadonlyMap<string, StoredRelief>>;

  /**
   * Writes a photograph's relief, replacing any it had. Returns the one it
   * replaced, so the caller can remove that one's files from the store.
   */
  put(relief: NewRelief): Promise<StoredRelief | null>;

  /** Removes it and returns it, so its files can go too. Null when there was none. */
  remove(mediaId: string): Promise<StoredRelief | null>;
}
