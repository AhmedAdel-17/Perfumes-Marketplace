/**
 * Public catalogue.
 *
 * Anonymous traffic is the majority and the SEO surface. RLS already restricts
 * these reads to live houses and published listings, so the router does not
 * re-filter — duplicating the predicate here would be a second place to get it
 * wrong.
 *
 * WHAT THIS GAINED IN P3.4.1 (ADR-10). The storefront read models used to live
 * in `apps/web/src/core/catalogue.ts` and query Postgres directly, as a
 * superuser, so nothing in migration 0002 applied to them. They are here now,
 * which means one data path, RLS on every read, and the same procedures
 * available to a native app that a page uses.
 *
 * THIS ROUTER IS WHERE THE THREE LAYERS MEET, and that is deliberate. The read
 * model gives rows in the database's own vocabulary; `@diyar/i18n` gives the
 * Arabic words; `ctx.media` turns a storage key into a URL for whichever bucket
 * this deployment uses. None of the three knows about the other two, and a page
 * gets something it can render without knowing about any of them.
 */
import { z } from 'zod';
import { BAND_FILL } from '@diyar/i18n';
import type {
  CatalogueProductRow, CataloguePhotoRow, GlossaryWord, NoteTier, Repositories, StoredRelief,
} from '@diyar/domain';
import { EMPTY_QUERY, NOTE_TIERS, noteIndex, queryTerms, type NoteIcon, type ScentFamily } from '@diyar/domain';
import { publicProcedure, router } from '../trpc';
import { slugSchema } from '../validation';
import type { MediaStore } from '../providers/media';

/** A product photograph as a storefront component renders it. */
export interface StorefrontPhoto {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The bottle lifted out of the primary photograph (Le Dévoilement, 0032): the
 * cut-out and relief map the reveal lights, and where the bottle sat in the
 * photograph, so the object can lie exactly over the picture before it rises.
 */
export interface StorefrontRelief {
  readonly cutoutUrl: string;
  readonly reliefUrl: string;
  readonly width: number;
  readonly height: number;
  readonly placement: { readonly centreX: number; readonly centreY: number; readonly height: number; readonly angle: number };
  readonly opaque: boolean;
}

export interface ProductCard {
  id: string; slug: string; name: string; brandLatin: string;
  /** The house's English name for the perfume, or null — the storefront then shows `name`. */
  nameEn: string | null;
  pricePiastres: number; volumeMl: number;
  /**
   * Scent-family CODE. It drives the flacon render, and the storefront turns it
   * into words in the visitor's language — labels are presentation, and an API
   * that answered in Arabic could never serve the English site.
   */
  family: string;
  /**
   * The primary photograph, when the house has uploaded a VERIFIED one.
   *
   * Null otherwise, and the storefront draws the illustrated flacon instead.
   * Rows written before the upload flow existed name paths with no file behind
   * them; they carry no facts (0021) and never become a URL, so the shop
   * cannot render a broken image from one.
   */
  photo: StorefrontPhoto | null;
  /** Concentration code; the storefront words it per language. Empty when unknown. */
  concentration: string;
  /**
   * How long it lasts, WITH where that claim came from (doc 06 §4). On the card
   * because a card that printed a band without its source would be presenting
   * a house's claim as the platform's fact.
   */
  longevity: PerformanceReading | null;
  /** Whether it can be put in a bag today. A page choosing a perfume to feature needs it. */
  inStock: boolean;
  /**
   * The top notes — what a visitor smells first — for the blotter a card draws
   * out of its photograph under the pointer (La Mouillette, 20 Oct 2026), each
   * with its English name and drawing from the glossary.
   */
  topNotes: CardNote[];
  /**
   * The primary photograph's relief, when the content team has made one (0032).
   * Null: no reveal. On the CARD since the reveal became the way into a
   * perfume's page (founder, 20 Oct 2026): pressing a card starts loading the
   * bottle at once, while its photograph is still in the air.
   */
  relief: StorefrontRelief | null;
}

/** One note as a card prints it: the house's word, its English, its drawing. */
export interface CardNote {
  note: string;
  en: string | null;
  icon: NoteIcon | null;
}

/**
 * A performance band as codes: which band, how full its meter is, and where
 * the claim came from (doc 06 §4). Words are the storefront's job.
 */
export interface PerformanceReading {
  band: string;
  fill: number;
  source: string;
}

export interface ProductDetail extends ProductCard {
  brandName: string;
  /** The house's Latin name as it writes it ("Maison Nour"), or null. */
  brandNameEn: string | null;
  /**
   * English names for this product's notes, from the platform glossary, keyed
   * by the Arabic note. A note with no entry is absent and shown in Arabic.
   */
  noteEnglish: Readonly<Record<string, string>>;
  /** The drawing for each of this product's notes that has one, keyed the same way. */
  noteIcons: Readonly<Record<string, NoteIcon>>;
  houseSlug: string;
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  projection: PerformanceReading | null;
  fulfilmentHours: number;
}

export interface HouseDetail {
  /** The seller id. Not shown anywhere — it is what a `storefront_view` is about. */
  id: string;
  slug: string;
  name: string;
  latin: string;
  /** The house's Latin name as it writes it, for the English storefront. */
  nameEn: string | null;
  bio: string | null;
  story: string | null;
  bioEn: string | null;
  storyEn: string | null;
  foundedYear: number | null;
  city: string | null;
  /** Where it delivers. Empty means it has not said, not that it delivers nowhere. */
  serviceGovernorates: string[];
  products: ProductCard[];
}

/**
 * The scent map's catalogue (La Carte olfactive, 20 Oct 2026): every published
 * perfume with its notes and the picture the map stands it as, and the
 * glossary's word for each note — its English, its drawing, its family.
 */
export interface ScentMapData {
  perfumes: Array<{
    id: string; slug: string; name: string; nameEn: string | null;
    brandName: string; brandNameEn: string | null; brandLatin: string;
    family: string; pricePiastres: number;
    /** The bottle cut out of its photograph, when the content team has made its relief. */
    cutout: { url: string; width: number; height: number } | null;
    photo: StorefrontPhoto | null;
    notesTop: string[]; notesHeart: string[]; notesBase: string[];
  }>;
  /** Only the notes the glossary knows; the map leaves any other off, never guessing. */
  glossary: Array<{ note: string; en: string; icon: NoteIcon | null; family: ScentFamily | null }>;
}

/** One note in the notes index, with its English name when the glossary has one. */
export interface IndexedNote {
  note: string;
  en: string | null;
  /** The drawing the glossary assigns it, or null for the neutral mark. */
  icon: NoteIcon | null;
  /** Published perfumes carrying it, in this tier. */
  count: number;
}

export interface SearchResult {
  products: ProductCard[];
  /** Every live house with something published, for the filter panel. */
  houses: Array<{ slug: string; name: string; nameEn: string | null }>;
  total: number;
}

const latin = (name: string, nameEn: string | null) => (nameEn ?? name).toUpperCase();

const photoMap = (rows: readonly CataloguePhotoRow[], media: MediaStore) => {
  const found = new Map<string, StorefrontPhoto>();
  for (const row of rows) {
    found.set(row.productId, {
      url: media.publicUrl(row.storageKey),
      alt: row.alt,
      width: row.width,
      height: row.height,
    });
  }
  return found;
};

const storefrontRelief = (relief: StoredRelief, media: MediaStore): StorefrontRelief => ({
  cutoutUrl: media.publicUrl(relief.cutoutKey),
  reliefUrl: media.publicUrl(relief.reliefKey),
  width: relief.width,
  height: relief.height,
  placement: relief.placement,
  opaque: relief.opaque,
});

/** A page's primary photographs and their reliefs, as read — before they are URLs. */
interface PicturesRead {
  readonly photos: readonly CataloguePhotoRow[];
  readonly reliefs: ReadonlyMap<string, StoredRelief>;
}

/** The same, by product and as a storefront renders them: what a card shows, and what the reveal lifts. */
interface CardPictures {
  readonly photos: ReadonlyMap<string, StorefrontPhoto>;
  readonly reliefs: ReadonlyMap<string, StorefrontRelief>;
}

/**
 * Read inside the caller's transaction, as the visitor: `public_read_reliefs`
 * decides which reliefs a page may show (a published perfume's only). Two
 * queries for a page of any length.
 */
const readPictures = async (r: Repositories, productIds: readonly string[]): Promise<PicturesRead> => {
  const photos = await r.catalogue.primaryPhotos(productIds);
  return { photos, reliefs: await r.reliefs.forPhotos(photos.map((p) => p.mediaId)) };
};

const cardPictures = (read: PicturesRead, media: MediaStore): CardPictures => {
  const reliefs = new Map<string, StorefrontRelief>();
  for (const photo of read.photos) {
    const relief = read.reliefs.get(photo.mediaId);
    if (relief) reliefs.set(photo.productId, storefrontRelief(relief, media));
  }
  return { photos: photoMap(read.photos, media), reliefs };
};

/**
 * A performance band, with the three things a meter needs and the one thing
 * doc 06 §4 requires: where the claim came from.
 */
const band = (value: string | null, source: string | null): PerformanceReading | null => {
  if (!value) return null;
  return {
    band: value,
    fill: BAND_FILL[value as keyof typeof BAND_FILL] ?? 50,
    source: source ?? 'seller_provided',
  };
};

const toCard = (
  row: CatalogueProductRow,
  pictures: CardPictures,
  glossary: ReadonlyMap<string, GlossaryWord>,
): ProductCard => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  nameEn: row.nameEn,
  brandLatin: latin(row.brandName, row.brandNameEn),
  pricePiastres: row.promoPricePiastres ?? row.pricePiastres,
  volumeMl: row.volumeMl,
  family: row.scentFamily ?? 'amber',
  photo: pictures.photos.get(row.id) ?? null,
  concentration: row.concentration ?? '',
  longevity: band(row.longevityBand, row.performanceSource),
  inStock: row.stock > 0,
  topNotes: row.notesTop.map((note) => ({
    note,
    en: glossary.get(note)?.en ?? null,
    icon: glossary.get(note)?.icon ?? null,
  })),
  relief: pictures.reliefs.get(row.id) ?? null,
});

/** Every top note of a list of perfumes, for one glossary read. */
const topNotesOf = (rows: readonly CatalogueProductRow[]): string[] => [...new Set(rows.flatMap((row) => row.notesTop))];

export const catalogueRouter = router({
  /** Every published product, for the home grid. */
  published: publicProcedure.query(async ({ ctx }): Promise<ProductCard[]> => {
    const { rows, pictures, glossary } = await ctx.uow.transaction(async (r) => {
      const found = await r.catalogue.publishedProducts();
      return {
        rows: found,
        pictures: await readPictures(r, found.map((p) => p.id)),
        glossary: await r.catalogue.noteGlossary(topNotesOf(found)),
      };
    });
    const shown = cardPictures(pictures, ctx.media);
    return rows.map((row) => toCard(row, shown, glossary));
  }),

  detail: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }): Promise<ProductDetail | null> => {
      const result = await ctx.uow.transaction(async (r) => {
        const row = await r.catalogue.productBySlug(input.slug);
        if (!row) return null;
        return {
          row,
          pictures: await readPictures(r, [row.id]),
          glossary: await r.catalogue.noteGlossary([...row.notesTop, ...row.notesHeart, ...row.notesBase]),
        };
      });
      if (!result) return null;

      const { row } = result;
      return {
        ...toCard(row, cardPictures(result.pictures, ctx.media), result.glossary),
        brandName: row.brandName,
        brandNameEn: row.brandNameEn,
        noteEnglish: Object.fromEntries([...result.glossary].map(([ar, word]) => [ar, word.en])),
        noteIcons: Object.fromEntries([...result.glossary]
          .filter((entry): entry is [string, GlossaryWord & { icon: NoteIcon }] => entry[1].icon !== null)
          .map(([ar, word]) => [ar, word.icon])),
        houseSlug: row.houseSlug ?? '',
        notesTop: [...row.notesTop],
        notesHeart: [...row.notesHeart],
        notesBase: [...row.notesBase],
        projection: band(row.projectionBand, row.performanceSource),
        fulfilmentHours: row.fulfilmentHours,
      };
    }),

  house: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }): Promise<HouseDetail | null> => {
      const result = await ctx.uow.transaction(async (r) => {
        const house = await r.catalogue.houseBySlug(input.slug);
        if (!house) return null;
        const rows = await r.catalogue.publishedProductsForHouse(house.id);
        return {
          house,
          rows,
          pictures: await readPictures(r, rows.map((p) => p.id)),
          glossary: await r.catalogue.noteGlossary(topNotesOf(rows)),
        };
      });
      if (!result) return null;

      const { house, rows, glossary } = result;
      const shown = cardPictures(result.pictures, ctx.media);
      return {
        id: house.id,
        slug: house.slug,
        name: house.tradingName,
        latin: latin(house.brandName ?? house.tradingName, house.brandNameEn),
        nameEn: house.brandNameEn,
        bio: house.bio,
        story: house.story,
        bioEn: house.bioEn,
        storyEn: house.storyEn,
        foundedYear: house.foundedYear,
        city: house.city,
        serviceGovernorates: [...house.serviceGovernorates],
        products: rows.map((row) => toCard(row, shown, glossary)),
      };
    }),

  /**
   * The scent map: the whole published catalogue, as anyone may read it. Each
   * perfume's relief is read as the visitor (RLS shows a published perfume's
   * only), in the same batched read the cards use.
   */
  scentMap: publicProcedure.query(async ({ ctx }): Promise<ScentMapData> => {
    const { rows, pictures, glossary } = await ctx.uow.transaction(async (r) => {
      const found = await r.catalogue.publishedProducts();
      const notes = [...new Set(found.flatMap((p) => [...p.notesTop, ...p.notesHeart, ...p.notesBase]))];
      return {
        rows: found,
        pictures: await readPictures(r, found.map((p) => p.id)),
        glossary: await r.catalogue.noteGlossary(notes),
      };
    });
    const shown = cardPictures(pictures, ctx.media);
    return {
      perfumes: rows.map((row) => {
        const relief = shown.reliefs.get(row.id);
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          nameEn: row.nameEn,
          brandName: row.brandName,
          brandNameEn: row.brandNameEn,
          brandLatin: latin(row.brandName, row.brandNameEn),
          family: row.scentFamily ?? 'amber',
          pricePiastres: row.promoPricePiastres ?? row.pricePiastres,
          cutout: relief ? { url: relief.cutoutUrl, width: relief.width, height: relief.height } : null,
          photo: shown.photos.get(row.id) ?? null,
          notesTop: [...row.notesTop],
          notesHeart: [...row.notesHeart],
          notesBase: [...row.notesBase],
        };
      }),
      glossary: [...glossary].map(([note, word]) => ({ note, en: word.en, icon: word.icon, family: word.family })),
    };
  }),

  /** Every live house that has something to sell — for the directory. */
  houses: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.uow.transaction((r) => r.catalogue.houses());
    return rows.map((h) => ({
      slug: h.slug,
      name: h.name,
      latin: latin(h.brandName, h.brandNameEn),
      nameEn: h.brandNameEn,
      city: h.city,
      foundedYear: h.foundedYear,
      count: h.publishedCount,
    }));
  }),

  /**
   * The notes the published catalogue carries, tier by tier, most-used first,
   * each with its English name where the glossary has one.
   *
   * Counted by the domain's `noteIndex` over the same rows the home grid reads,
   * so the number beside a note and the perfumes a search for it finds come
   * from one set — RLS's, as `anon`.
   */
  noteIndex: publicProcedure
    .input(z.object({ perTier: z.number().int().min(1).max(20).default(5) }).default({}))
    .query(async ({ ctx, input }): Promise<Record<NoteTier, IndexedNote[]>> => {
      const { index, glossary } = await ctx.uow.transaction(async (r) => {
        const counted = noteIndex(await r.catalogue.publishedProducts(), input.perTier);
        const notes = NOTE_TIERS.flatMap((tier) => counted[tier].map((n) => n.note));
        return { index: counted, glossary: await r.catalogue.noteGlossary(notes) };
      });
      const named = (tier: NoteTier): IndexedNote[] =>
        index[tier].map((n) => ({
          note: n.note,
          en: glossary.get(n.note)?.en ?? null,
          icon: glossary.get(n.note)?.icon ?? null,
          count: n.count,
        }));
      return { top: named('top'), heart: named('heart'), base: named('base') };
    }),

  /**
   * The catalogue, narrowed.
   *
   * Takes the query ALREADY PARSED, because the caller needs it parsed anyway —
   * the search page reads the same object to count active filters and to decide
   * whether anything was asked at all. Sending the raw URL instead would mean
   * parsing it twice, in two places, which is how two callers end up with two
   * search behaviours nobody decided on.
   *
   * Splitting the text into TERMS stays here, on the server, in the domain's
   * own function. That is the half a client must not be trusted with: it is
   * what makes ليل القاهره find ليل القاهرة, and a caller that split words
   * differently would get quietly different results rather than an error.
   */
  search: publicProcedure
    .input(z.object({
      text: z.string().max(200).default(''),
      families: z.array(z.string().max(40)).max(20).default([]),
      houses: z.array(slugSchema).max(50).default([]),
      minEgp: z.number().int().nonnegative().nullable().default(null),
      maxEgp: z.number().int().nonnegative().nullable().default(null),
      inStockOnly: z.boolean().default(false),
      sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    }))
    .query(async ({ ctx, input }): Promise<SearchResult> => {
      const criteria = {
        terms: queryTerms({ ...EMPTY_QUERY, text: input.text }),
        families: input.families,
        houses: input.houses,
        minEgp: input.minEgp,
        maxEgp: input.maxEgp,
        inStockOnly: input.inStockOnly,
        sort: input.sort,
      };

      const { rows, houses, pictures, glossary } = await ctx.uow.transaction(async (r) => {
        const found = await r.catalogue.search(criteria);
        return {
          rows: found,
          houses: await r.catalogue.houseFilterOptions(),
          pictures: await readPictures(r, found.map((p) => p.id)),
          glossary: await r.catalogue.noteGlossary(topNotesOf(found)),
        };
      });

      const shown = cardPictures(pictures, ctx.media);
      return {
        products: rows.map((row) => toCard(row, shown, glossary)),
        houses,
        total: rows.length,
      };
    }),

  /* ---------------------------------------- the narrow reads that came first */

  productBySlug: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.uow.transaction((r) => r.products.findBySlug(input.slug));
      if (!product) return null;
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku,
        // Money never crosses the wire as a float. Piastres, formatted by the client.
        pricePiastres: product.price.minor,
        volumeMl: product.volumeMl,
        inStock: product.stock > 0,
      };
    }),
});
