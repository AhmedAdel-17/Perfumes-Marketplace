import 'server-only';
import type { CatalogueQuery } from '@diyar/domain';
import { api } from './api';

/**
 * The shopfront's reads, as the pages call them.
 *
 * EMPTIED 20 September 2026 (task P3.4.1, ADR-10). This file used to hold the
 * queries themselves — six joins against Drizzle, run on the raw connection.
 * That connection is a SUPERUSER, and Postgres never applies row-level security
 * to a superuser, so every policy in migration 0002 was bypassed on the busiest
 * path in the product. The catalogue happens to be public, which is why nothing
 * leaked; the danger was the precedent, and one file down the corridor
 * (`features/seller/actions.ts`) was resolving sign-in the same way.
 *
 * The queries now live in `packages/db`'s `catalogueReadModel`, behind a domain
 * port, reached through `catalogue.*` procedures that run inside the Unit of
 * Work as `anon`. So the same reads are governed by the same policies as
 * everything else, and a native app gets the procedures rather than a second
 * copy of the SQL.
 *
 * WHAT IS LEFT HERE is the seam and nothing more: six functions that call the
 * API, and the read-model types re-exported so a component importing
 * `ProductCard` did not have to learn a new path for a change it has no stake
 * in. Delete this file when the pages call `api()` directly and the tidiness is
 * worth the churn.
 */

export type {
  HouseDetail, ProductCard, ProductDetail, SearchResult, StorefrontPhoto,
} from '@diyar/api';

export const listPublishedProducts = () => api().catalogue.published();

export const findProductBySlug = (slug: string) => api().catalogue.detail({ slug });

export const findHouseBySlug = (slug: string) => api().catalogue.house({ slug });

export const listHouses = () => api().catalogue.houses();

/**
 * The catalogue, narrowed.
 *
 * Takes the query ALREADY PARSED, because the page that calls this parsed it
 * from the URL and reads the same object to count active filters. The text is
 * split into terms on the server, in the domain's own function — that half is
 * what makes ليل القاهره find ليل القاهرة, and it is not a caller's to decide.
 */
export const searchCatalogue = (query: CatalogueQuery) => api().catalogue.search({
  text: query.text,
  families: [...query.families],
  houses: [...query.houses],
  minEgp: query.minEgp,
  maxEgp: query.maxEgp,
  inStockOnly: query.inStockOnly,
  sort: query.sort,
});
