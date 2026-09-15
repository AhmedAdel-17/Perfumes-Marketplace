/**
 * Where product photographs may be fetched from for resizing.
 *
 * In development photographs are served by this app at `/dev-media/…`, a
 * same-site path Next treats as a local image — no pattern needed. In production
 * they come from the R2 public origin (founder decision M-1), read here at BUILD
 * time: a deploy that changes the media domain must be rebuilt, which is the
 * same moment its other configuration changes.
 *
 * Nothing is allowed when the variable is absent. An open `remotePatterns` would
 * turn the image optimiser into a proxy for any URL on the internet.
 */
const mediaOrigin = process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL) : null;

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // PGlite ships WebAssembly and must not be bundled for the browser. In
  // production this is postgres-js instead; the Drizzle code is identical.
  serverExternalPackages: ['@electric-sql/pglite'],
  typedRoutes: true,
  images: {
    remotePatterns: mediaOrigin
      ? [{
          protocol: /** @type {'https' | 'http'} */ (mediaOrigin.protocol.replace(':', '')),
          hostname: mediaOrigin.hostname,
          pathname: '/products/**',
        }]
      : [],
  },
};
