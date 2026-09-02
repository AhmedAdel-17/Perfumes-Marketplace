/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // PGlite ships WebAssembly and must not be bundled for the browser. In
  // production this is postgres-js instead; the Drizzle code is identical.
  serverExternalPackages: ['@electric-sql/pglite'],
  typedRoutes: true,
};
