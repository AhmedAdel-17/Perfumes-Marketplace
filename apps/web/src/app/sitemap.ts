import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { localePath } from '@diyar/i18n';
import { api } from '@/core/api';
import { listHouses, listPublishedProducts } from '@/core/catalogue';

/**
 * Every public page of the shop, in both languages (16 Nov 2026).
 *
 * Read from the published catalogue as `anon`, so a draft perfume, a suspended
 * house or an archived page can never be announced to a search engine. Each
 * entry names its twin in the other language, matching the `hreflang` the
 * pages themselves declare.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3100';
  const proto = head.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  const [products, houses, pages] = await Promise.all([
    listPublishedProducts(),
    listHouses(),
    api().content.directory(),
  ]);

  const paths = [
    '/', '/search', '/houses', '/scent-map',
    ...houses.map((h) => `/house/${h.slug}`),
    ...products.map((p) => `/p/${p.slug}`),
    ...pages.map((p) => `/${p.slug}`),
  ];

  return paths.map((path) => ({
    url: `${origin}${localePath('ar', path)}`,
    alternates: {
      languages: {
        ar: `${origin}${localePath('ar', path)}`,
        en: `${origin}${localePath('en', path)}`,
      },
    },
  }));
}
