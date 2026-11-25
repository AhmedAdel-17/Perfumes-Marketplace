import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

/**
 * What search engines may read (16 Nov 2026; CLAUDE.md §14 — storefronts are an
 * acquisition surface).
 *
 * The shop is open to them; the house portal, the console, the bag, checkout
 * and order tracking are not — they are personal or private, and a search
 * result that lands a stranger on someone's order lookup is a result that
 * should not exist. The origin is read from the request, as the root layout
 * reads it for `metadataBase`, so staging and production each name themselves.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3100';
  const proto = head.get('x-forwarded-proto') ?? (host.startsWith('localhost')?'http':'https');
  const disallow = ['/seller', '/ops', '/cart', '/checkout', '/order', '/api', '/dev-media', '/design-preview', '/account', '/sign-in'];
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...disallow, ...disallow.map((p) => `/en${p}`)] }],
    sitemap: `${proto}://${host}/sitemap.xml`,
  };
}
