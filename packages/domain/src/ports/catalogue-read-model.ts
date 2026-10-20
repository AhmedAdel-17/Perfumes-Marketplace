/**
 * The shopfront's reads, as a port.
 *
 * PATTERN: a read model, separate from the repositories beside it
 * (ENGINEERING_PRINCIPLES §4). The others load an aggregate so a rule can be
 * applied to it. These load a SHAPE a page renders, joined across products,
 * brands, houses and media, and nothing in them is ever written back. Forcing
 * them through `ProductRepository` would mean either loading four aggregates
 * per tile or growing the aggregate until it carried its own brand's Latin
 * name — and a grid of twenty-four tiles is the one place where the difference
 * between one query and twenty-four is the whole page.
 *
 * WHY THIS EXISTS AT ALL (ADR-10, task P3.4.1). These queries lived in
 * `apps/web/src/core/catalogue.ts` and ran against Postgres directly, as a
 * superuser, so every policy in migration 0002 was bypassed on the busiest path
 * in the product. Moving them behind a port puts them back inside the Unit of
 * Work, which means they run as `anon` and RLS decides what a visitor sees —
 * the same decision, made once, in the database.
 *
 * NO LABELS AND NO URLS HERE. The rows carry the database's own vocabulary
 * (`oud`, `eau_de_parfum`, `very_long`) and a storage KEY rather than a link.
 * Arabic words live in `@diyar/i18n` and a URL is whatever the media adapter
 * says it is today; a port that returned either would be a port that has to
 * change when the copy changes or when the bucket moves.
 */

/** A row as the catalogue reads it — the product, plus the two names around it. */
import type { NoteIcon, ScentFamily } from '../catalogue/vocabularies';

/** What the glossary says about one note, for the storefront. */
export interface GlossaryWord {
  readonly en: string;
  readonly icon: NoteIcon | null;
  /** The family it belongs to by nature (0035), or null until the content team chooses one. */
  readonly family: ScentFamily | null;
}

export interface CatalogueProductRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** The house's own English name for the perfume, when it has given one. */
  readonly nameEn: string | null;
  readonly pricePiastres: number;
  readonly promoPricePiastres: number | null;
  readonly volumeMl: number;
  readonly stock: number;
  readonly scentFamily: string | null;
  readonly concentration: string | null;
  readonly notesTop: readonly string[];
  readonly notesHeart: readonly string[];
  readonly notesBase: readonly string[];
  readonly longevityBand: string | null;
  readonly projectionBand: string | null;
  readonly performanceSource: string | null;
  readonly fulfilmentHours: number;
  /** The brand's own name, and its Latin form when it has one. */
  readonly brandName: string;
  readonly brandNameEn: string | null;
  /** The house's storefront address. Present only where a page links to it. */
  readonly houseSlug: string | null;
}

/**
 * A verified primary photograph, as stored.
 *
 * `storageKey`, not a URL: the same object is served from a different host in
 * development and in production, and a row that remembered one of them would be
 * wrong in the other. Only VERIFIED rows appear — a row with no `contentType`
 * carries no facts (migration 0021) and would render as a broken image.
 */
export interface CataloguePhotoRow {
  readonly productId: string;
  /** The `product_media` row — what a relief (0032) belongs to. */
  readonly mediaId: string;
  readonly storageKey: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

/** A house's storefront, without its products. */
export interface CatalogueHouseRow {
  readonly id: string;
  readonly slug: string;
  readonly tradingName: string;
  readonly bio: string | null;
  readonly story: string | null;
  /** The same two in English (0030), when somebody has written them. */
  readonly bioEn: string | null;
  readonly storyEn: string | null;
  readonly foundedYear: number | null;
  readonly city: string | null;
  readonly serviceGovernorates: readonly string[];
  /** The Latin wordmark, from the house's first brand. */
  readonly brandNameEn: string | null;
  readonly brandName: string | null;
}

/** A line in the houses directory. */
export interface CatalogueHouseSummary {
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly brandNameEn: string | null;
  readonly city: string | null;
  readonly foundedYear: number | null;
  readonly publishedCount: number;
}

/**
 * What a search asks for, already parsed.
 *
 * Deliberately the domain's own `CatalogueQuery` rather than a second shape:
 * the parsing, the folding and the term splitting are rules, they are tested in
 * the domain, and a port that took a raw string would invite each caller to
 * parse it again slightly differently.
 */
export interface CatalogueSearchCriteria {
  readonly terms: readonly string[];
  readonly families: readonly string[];
  readonly houses: readonly string[];
  readonly minEgp: number | null;
  readonly maxEgp: number | null;
  readonly inStockOnly: boolean;
  readonly sort: 'newest' | 'price_asc' | 'price_desc';
}

export interface CatalogueReadModel {
  /**
   * Every published product, NEWEST FIRST: by the moment it was published, or
   * by when it was created where no publish moment was recorded. The home page
   * calls the first few "recently registered", and that has to be true.
   */
  publishedProducts(): Promise<CatalogueProductRow[]>;

  /**
   * One product, by its storefront address.
   *
   * Returns null for anything not published. That is RLS's answer rather than a
   * filter here: an unpublished product is invisible to `anon`, so this reads
   * as "no such product", which is also what it should look like.
   */
  productBySlug(slug: string): Promise<CatalogueProductRow | null>;

  /** A live house's storefront, or null. A suspended house has no shopfront. */
  houseBySlug(slug: string): Promise<CatalogueHouseRow | null>;

  /** Everything a given house has published. */
  publishedProductsForHouse(sellerId: string): Promise<CatalogueProductRow[]>;

  /** Every live house with something to sell, for the directory. */
  houses(): Promise<CatalogueHouseSummary[]>;

  /**
   * English names for the given Arabic notes, from the platform's glossary.
   *
   * Only the notes asked for, and only those that have an entry: a note the
   * glossary does not know yet is simply absent, and the storefront shows the
   * Arabic for it.
   */
  noteGlossary(notes: readonly string[]): Promise<ReadonlyMap<string, GlossaryWord>>;

  /** The catalogue, narrowed. Ordering and filtering happen in SQL. */
  search(criteria: CatalogueSearchCriteria): Promise<CatalogueProductRow[]>;

  /**
   * Every live house with something published, for a filter panel.
   *
   * NOT narrowed by the current query, and that is a product decision rather
   * than an oversight: a panel offering only what the current results contain
   * traps you, because picking one house makes every other house vanish from
   * the list you would use to switch.
   */
  houseFilterOptions(): Promise<Array<{ slug: string; name: string; nameEn: string | null }>>;

  /**
   * The verified primary photograph of each product, in ONE query.
   *
   * Asked once per page rather than once per product: a grid of twenty-four is
   * otherwise twenty-four round trips before the first byte, and that cost
   * lands on exactly the connections this product is built for.
   */
  primaryPhotos(productIds: readonly string[]): Promise<CataloguePhotoRow[]>;
}
