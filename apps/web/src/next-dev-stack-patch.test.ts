/**
 * The local patch to Next's dev runtime is actually installed.
 *
 * WHY THIS EXISTS. On the first render of a route after `next dev` starts,
 * React's async debug info can exceed its size budget and reach the client with
 * its stack replaced by a placeholder string. React's dev Flight client then
 * walks that string as if it were an array of frames, calls `frame.join` on a
 * single character, and the page answers 500 ("frame.join is not a function").
 * Reload, and it is fine — which is exactly why it survived: the dev server
 * looked flaky, and two browser tests failed now and then on whichever route
 * happened to compile cold (found 14–15 Oct 2026, task P5.1.3).
 *
 * The guard lives in `patches/next@15.5.25.patch`, applied by pnpm
 * (`patchedDependencies` in pnpm-workspace.yaml, where the reasoning and the
 * removal condition are written). A patch is only as good as the install that
 * applied it: a reinstall with the entry deleted, or an upgrade to a Next whose
 * files moved, would bring the 500 back silently. This test reads the two files
 * a `next dev --turbopack` actually loads and fails if either is unguarded.
 *
 * When a Next upgrade ships a guarded `buildFakeCallStack` upstream, delete the
 * patch, this test, and the workspace entry together.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nextRoot = dirname(createRequire(import.meta.url).resolve('next/package.json'));
const read = (path: string) => readFileSync(join(nextRoot, path), 'utf8');

/** The two copies `next dev --turbopack` loads: the SSR runtime and the browser client. */
const SERVER = 'dist/compiled/next-server/app-page-turbo.runtime.dev.js';
const BROWSER = 'dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.browser.development.js';

describe("Next's dev runtime is patched against an omitted debug stack", () => {
  it('is the version the patch was written for', () => {
    // A different version means the patch no longer applies (pnpm refuses it),
    // so this line is where an upgrade is noticed first.
    expect(JSON.parse(read('package.json')).version).toBe('15.5.25');
  });

  it('guards the server runtime', () => {
    const source = read(SERVER);
    expect(source).toContain(
      'function buildFakeCallStack(response,stack,environmentName,useEnclosingLine,innerCall){if(!Array.isArray(stack))return innerCall;',
    );
    expect(source).toContain('if(!Array.isArray(stack[i]))continue;var frame=stack[i],');
  });

  it('guards the browser client', () => {
    const source = read(BROWSER);
    expect(source).toContain('if (!Array.isArray(stack)) return innerCall;');
    expect(source).toContain('if (!Array.isArray(stack[i])) continue;');
  });

  it('leaves no unguarded copy of the loop in either file', () => {
    // The unpatched shape: the loop straight after the signature. If Next ever
    // ships a second copy in one of these files, the patch would cover one and
    // miss the other — this is the line that notices.
    expect(read(SERVER)).not.toMatch(/innerCall\)\{for\(var i=0;i<stack\.length/);
    expect(read(BROWSER)).not.toMatch(/innerCall\n {4}\) \{\n {6}for \(var i = 0; i < stack\.length/);
  });
});
