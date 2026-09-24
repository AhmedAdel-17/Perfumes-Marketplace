/**
 * Where images may be fetched from for resizing.
 *
 * In development images are served by this app at `/dev-media/…`, a same-site
 * path Next treats as a local image — no pattern needed. In production they come
 * from the R2 public origin (founder decision M-1), read here at BUILD time: a
 * deploy that changes the media domain must be rebuilt, which is the same moment
 * its other configuration changes.
 *
 * Nothing is allowed when the variable is absent. An open `remotePatterns` would
 * turn the image optimiser into a proxy for any URL on the internet.
 *
 * One pattern per key prefix the server issues — `products/` for a house's
 * photographs, `content/` for editorial images (0022) — and nothing else in the
 * bucket. Forgetting the second one passes every check in development, where
 * nothing goes through this list, and breaks every editorial image in production.
 */
const mediaOrigin = process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL) : null;

const MEDIA_PREFIXES = ['/products/**', '/content/**'];

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  /*
   * The headers that are the same on every response (P3.4.3, 05 §9). The
   * Content-Security-Policy is NOT here: it carries a per-request nonce, so
   * middleware.ts writes it.
   *
   * HSTS is harmless over plain http — browsers only honour it on https — so it
   * is sent everywhere rather than guessed at per environment. Two years and
   * subdomains, without `preload`, because preload is a registry submission and
   * nearly irreversible, and the domain is not even chosen yet (D-1).
   */
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Belt and braces with `frame-ancestors 'none'`, for browsers that predate it.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ],
    }];
  },
  /*
   * Development only: keep every compiled route compiled.
   *
   * By default `next dev` evicts a page unused for 60 seconds and keeps five.
   * Found in CI (P3.4.3): the browser suites warm all thirty routes first, and
   * twenty minutes later `/seller/listings/[id]` compiled AGAIN, for 24 seconds,
   * under the audit's navigation — which timed out. Eviction had quietly undone
   * the warm-up, so the warm-up cost memory and bought nothing. Thirty routes
   * is a small app; there is nothing to evict for. `next build` ignores this.
   */
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  // PGlite ships WebAssembly and must not be bundled for the browser. In
  // production this is postgres-js instead; the Drizzle code is identical.
  serverExternalPackages: ['@electric-sql/pglite'],
  typedRoutes: true,
  images: {
    remotePatterns: mediaOrigin
      ? MEDIA_PREFIXES.map((pathname) => ({
          protocol: /** @type {'https' | 'http'} */ (mediaOrigin.protocol.replace(':', '')),
          hostname: mediaOrigin.hostname,
          pathname,
        }))
      : [],
  },
};
