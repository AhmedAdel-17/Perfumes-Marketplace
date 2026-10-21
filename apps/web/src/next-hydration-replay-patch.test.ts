/**
 * The backported React hydration fix is actually installed.
 *
 * WHY THIS EXISTS. React Flight (19.2) defers any element into a separate lazy
 * row once a row passes 3,200 serialized characters, and an async server
 * component's output always arrives as one. When the HTML stream is slow,
 * hydration can reach such a row before it has arrived. React then suspends
 * inside the host element that holds it. When the row lands, the React 19.2
 * canary that Next 15.5 ships REPLAYS that element without resetting its
 * hydration cursor, so the element claims its own first child, every element
 * below claims one level too deep, and React throws the server HTML away and
 * renders the page again on the client. Under load this happened on 5–25% of
 * page loads: the masthead's Perfumes panel and the footer (found 20–21 Oct
 * 2026). On a slow phone connection it would happen in production.
 *
 * Fixed upstream in facebook/react#35494 (React 19.3 canary, which Next 16
 * ships). `patches/next@15.5.25.patch` backports it to the four react-dom
 * client builds Next vendors: it restores the cursor to the element's own node
 * (`popHydrationStateOnInterruptedWork`) before the replay. The reasoning and
 * removal condition are in pnpm-workspace.yaml and docs/DEBT_REGISTER.md.
 *
 * A patch is only as good as the install that applied it. This test reads the
 * four files and fails if any of them replays a host element without the
 * restore. When Next is upgraded to a version whose React includes #35494,
 * delete these hunks of the patch and this test together.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nextRoot = dirname(createRequire(import.meta.url).resolve('next/package.json'));
const read = (path: string) => readFileSync(join(nextRoot, path), 'utf8');

/** Development and production client, and the two profiling builds (`next build --profile`). */
const BUILDS = [
  'dist/compiled/react-dom/cjs/react-dom-client.development.js',
  'dist/compiled/react-dom/cjs/react-dom-client.production.js',
  'dist/compiled/react-dom/cjs/react-dom-profiling.development.js',
  'dist/compiled/react-dom/cjs/react-dom-profiling.profiling.js',
];

const count = (source: string, pattern: RegExp) => source.match(new RegExp(pattern.source, 'g'))?.length ?? 0;

describe('React hydration replay fix (facebook/react#35494) is backported', () => {
  it('is the version the patch was written for', () => {
    // A different version means the patch no longer applies (pnpm refuses it).
    // At that point, check whether the new React includes #35494.
    expect(JSON.parse(read('package.json')).version).toBe('15.5.25');
  });

  it.each(BUILDS)('%s restores the cursor before replaying a host element', (path) => {
    const source = read(path);
    expect(count(source, /function popHydrationStateOnInterruptedWork\(fiber\) \{/)).toBe(1);
    expect(source).toMatch(/popToNextHostParent\(fiber\);\n\s*5 === fiber\.tag &&\n\s*null != fiber\.stateNode &&\n\s*\(nextHydratableInstance = fiber\.stateNode\);/);
    // The replay's HostComponent case calls it, on the same fiber, before
    // falling through to unwindInterruptedWork and beginWork.
    expect(count(source, /case 5:\n\s*resetHooksOnUnwind\((\w+)\);\n\s*popHydrationStateOnInterruptedWork\(\1\);\n\s*default:\n\s*unwindInterruptedWork\(current, \1\),/)).toBe(1);
  });

  it.each(BUILDS)('%s has no unpatched replay left', (path) => {
    // The upstream 19.2 shape: straight from resetHooksOnUnwind into the
    // fallthrough. A second copy anywhere would be a replay the patch missed.
    expect(read(path)).not.toMatch(/case 5:\n\s*resetHooksOnUnwind\((\w+)\);\n\s*default:\n\s*unwindInterruptedWork\(current, \1\),/);
  });
});
