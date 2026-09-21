/**
 * Compile every route of the dev server before a browser suite touches it.
 *
 * WHY (P3.4.3, found on the first CI run). The browser suites run against
 * `next dev`, which compiles a route the first time it is requested. On a CI
 * runner some routes took ten seconds, and the accessibility audit crashed
 * with `net::ERR_ABORTED` on `/ops/returns` at the exact moment that route was
 * being compiled — a navigation interrupted by the dev server, not a defect in
 * the page. Every other surface passed. Locally the same run was clean, because
 * a warm machine had compiled the route long before.
 *
 * So the suites stop depending on luck: this requests every route once and
 * waits, and only then does a test navigate. A redirect, a 404 or a sign-in
 * wall still compiles the route, which is all that is needed here.
 *
 * THE ROUTE LIST IS DERIVED, not written down. It walks `src/app` and turns each
 * `page.tsx` into a path, filling dynamic segments with a placeholder. A list
 * kept by hand would be missing whichever route was added last — which is the
 * one most likely to be compiled for the first time in the middle of a test.
 *
 * Run: node scripts/warm.mjs   (BASE_URL defaults to http://localhost:3100)
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const APP = join(import.meta.dirname, '..', 'src', 'app');
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

function pages(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (entry === 'page.tsx' || entry === 'page.ts') out.push(current);
    }
  };
  walk(dir);
  return out;
}

const toPath = (dir) => {
  const segments = relative(APP, dir).split(sep).filter(Boolean)
    // Route groups `(name)` are not part of the URL.
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => {
      if (s.startsWith('[...') || s.startsWith('[[...')) return 'warm';
      if (s === '[id]') return PLACEHOLDER_ID;
      if (s.startsWith('[')) return 'warm';
      return s;
    });
  return `/${segments.join('/')}`;
};

const paths = [...new Set(pages(APP).map(toPath))].sort();

let compiled = 0;
for (const path of paths) {
  const started = Date.now();
  try {
    // `manual`: a redirect to a sign-in page is still a compiled route, and
    // following it would only compile the sign-in page again.
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    await res.arrayBuffer();
    compiled += 1;
    console.log(`  ${String(res.status).padEnd(4)}${path}  ${Date.now() - started}ms`);
  } catch (error) {
    console.error(`  FAIL ${path}  ${error.message}`);
    process.exitCode = 1;
  }
}

// An empty walk would "warm" nothing and report success.
if (paths.length < 20) {
  console.error(`Found only ${paths.length} routes under src/app — the walk is broken.`);
  process.exit(2);
}
console.log(`Warmed ${compiled}/${paths.length} routes.`);
