/**
 * The local patch that makes `next dev` re-render edited server components is
 * actually installed.
 *
 * WHY THIS EXISTS. Edit a server component that several routes share — the site
 * footer, say — and Turbopack recompiles it, but `next dev` 15.5.x served the old
 * markup on every compiled route except the first one rebuilt after the save.
 * `clearRequireCache` checks per route whether that route's server chunks
 * changed, and it stored the route's hash under the route key rather than
 * `route:path`, so only the process-wide hash per file was ever compared. The
 * first route to be rebuilt (usually whichever page an open browser tab
 * refreshes on HMR) consumed the change; the rest looked "unchanged" and kept
 * their cached runtime until the server restarted (found 15 Oct 2026).
 *
 * The fix is Next 16.0.0's own change, backported in `patches/next@15.5.25.patch`
 * (`patchedDependencies` in pnpm-workspace.yaml has the reasoning and the removal
 * condition). It sits beside the debug-stack guard that
 * `next-dev-stack-patch.test.ts` checks. The two are independent and are removed
 * on different upgrades: this one on the move to Next 16.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Resolved the way the dev server resolves it, so this reads the copy that runs. */
const HOT_RELOADER = createRequire(import.meta.url).resolve('next/dist/server/dev/hot-reloader-turbopack.js');

/** The body of `clearRequireCache`, up to the point where it starts evicting. */
function clearRequireCache(): string {
  const source = readFileSync(HOT_RELOADER, 'utf8');
  const start = source.indexOf('function clearRequireCache(');
  const end = source.indexOf('resetFetch();', start);
  expect(start, 'clearRequireCache not found: Next moved it; re-check the patch').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Next's dev server evicts every route whose server chunks changed", () => {
  it('records the per-route hash under the route-and-path key', () => {
    const body = clearRequireCache();
    expect(body).toContain('const localKey = `${key}:${path}`;');
    // Once when the hash changed, once when it was first seen, once on a forced clear.
    expect(body.match(/serverPathState\.set\(localKey, contentHash\)/g)).toHaveLength(3);
  });

  it('never records a hash under the bare route key', () => {
    // The unpatched shape. A single surviving copy is enough to bring the stale
    // routes back, because the route's own hash would never be stored.
    expect(clearRequireCache()).not.toContain('serverPathState.set(key, contentHash)');
  });
});
