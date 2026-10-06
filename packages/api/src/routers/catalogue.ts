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
import type { CatalogueProductRow, CataloguePhotoRow } from '@diyar/domain';
import { EMPTY_QUERY, queryTerms } from '@diyar/domain';
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
  houseSlug: string;
  /** Concentration code; the storefront words it per language. */
  concentration: string;
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  longevity: PerformanceReading | null;
  projection: PerformanceReading | null;
  fulfilmentHours: number;
  inStock: boolean;
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

const toCard = (
  row: CatalogueProductRow,
  photos: ReadonlyMap<string, StorefrontPhoto>,
): ProductCard => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  nameEn: row.nameEn,
  brandLatin: latin(row.brandName, row.brandNameEn),
  pricePiastres: row.promoPricePiastres ?? row.pricePiastres,
  volumeMl: row.volumeMl,
  family: row.scentFamily ?? 'amber',
  photo: photos.get(row.id) ?? null,
});

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

export const catalogueRouter = router({
  /** Every published product, for the home grid. */
  published: publicProcedure.query(async ({ ctx }): Promise<ProductCard[]> => {
    const { rows, photos } = await ctx.uow.transaction(async (r) => {
      const found = await r.catalogue.publishedProducts();
      return { rows: found, photos: await r.catalogue.primaryPhotos(found.map((p) => p.id)) };
    });
    const map = photoMap(photos, ctx.media);
    return rows.map((row) => toCard(row, map));
  }),

  detail: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }): Promise<ProductDetail | null> => {
      const result = await ctx.uow.transaction(async (r) => {
        const row = await r.catalogue.productBySlug(input.slug);
        if (!row) return null;
        return {
          row,
          photos: await r.catalogue.primaryPhotos([row.id]),
          glossary: await r.catalogue.noteGlossary([...row.notesTop, ...row.notesHeart, ...row.notesBase]),
        };
      });
      if (!result) return null;

      const { row } = result;
      const map = photoMap(result.photos, ctx.media);
      return {
        ...toCard(row, map),
        brandName: row.brandName,
        brandNameEn: row.brandNameEn,
        noteEnglish: Object.fromEntries(result.glossary),
        houseSlug: row.houseSlug ?? '',
        concentration: row.concentration ?? '',
        notesTop: [...row.notesTop],
        notesHeart: [...row.notesHeart],
        notesBase: [...row.notesBase],
        longevity: band(row.longevityBand, row.performanceSource),
        projection: band(row.projectionBand, row.performanceSource),
        fulfilmentHours: row.fulfilmentHours,
        inStock: row.stock > 0,
      };
    }),

  house: publicProcedure
    .input(z.object({ slug: slugSchema }))
    .query(async ({ ctx, input }): Promise<HouseDetail | null> => {
      const result = await ctx.uow.transaction(async (r) => {
        const house = await r.catalogue.houseBySlug(input.slug);
        if (!house) return null;
        const rows = await r.catalogue.publishedProductsForHouse(house.id);
        return { house, rows, photos: await r.catalogue.primaryPhotos(rows.map((p) => p.id)) };
      });
      if (!result) return null;

      const { house, rows } = result;
      const map = photoMap(result.photos, ctx.media);
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
        products: rows.map((row) => toCard(row, map)),
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
      count: h.publishedCount,
    }));
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

      const { rows, houses, photos } = await ctx.uow.transaction(async (r) => {
        const found = await r.catalogue.search(criteria);
        return {
          rows: found,
          houses: await r.catalogue.houseFilterOptions(),
          photos: await r.catalogue.primaryPhotos(found.map((p) => p.id)),
        };
      });

      const map = photoMap(photos, ctx.media);
      return {
        products: rows.map((row) => toCard(row, map)),
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
