/**
 * The dependency rule, enforced.
 *
 * ```
 * apps  →  api  →  domain  ←  adapters (db, paymob, bosta, sms)
 *                     ↑
 *              depends on NOTHING
 * ```
 *
 * WHY THIS FILE EXISTS. The README says this rule is "checked by lint, not by
 * memory". There is no linter: `pnpm lint` runs turbo, turbo finds no `lint`
 * script in any package, reports "No tasks were executed" and exits zero. So
 * the single most important architectural invariant in this codebase was
 * checked by memory, under a sentence saying it was not.
 *
 * WHY A TEST RATHER THAN ESLINT. A test runs in the same suite as everything
 * else, fails with a message that explains the rule rather than a rule id, and
 * has no configuration file to drift from what it claims to enforce. Adding a
 * linter is still worth doing for the hundred smaller things a linter catches —
 * but the load-bearing rule should not wait for it, and should not depend on a
 * config somebody can relax in one line.
 *
 * WHAT THE RULE BUYS. The domain is importable from a React Native app, from a
 * script, from a test with no database. Every money rule in this system can be
 * exercised in microseconds because nothing in `packages/domain` knows what a
 * request, a connection or a component is. One stray import ends that quietly.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOMAIN = join(import.meta.dirname);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Every module specifier a file imports, type-only imports included. */
function imports(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]!);
  }
  return found;
}

/**
 * What a domain module may import.
 *
 * Relative paths, and nothing else. Not `vitest` — that is why test files are
 * excluded rather than exempted, so a production module cannot quietly import a
 * test framework and be waved through.
 */
const isRelative = (specifier: string) => specifier.startsWith('.');

describe('the domain depends on nothing', () => {
  const production = sourceFiles(DOMAIN).filter((f) => !/\.test\.ts$/.test(f));

  it('has production modules to check, so an empty glob cannot pass', () => {
    // A path that stops matching — a folder rename, a build layout change —
    // would make every assertion below vacuously true.
    expect(production.length).toBeGreaterThan(20);
  });

  it('imports nothing but its own relative modules', () => {
    const offenders: string[] = [];

    for (const file of production) {
      const relative = file.slice(DOMAIN.length + 1).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf8')
        // Comments first: this file's own prose names frameworks, and several
        // domain modules explain in a comment what they are NOT importing.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const specifier of imports(source)) {
        if (isRelative(specifier)) continue;
        offenders.push(`${relative} → ${specifier}`);
      }
    }

    expect(
      offenders,
      'The domain imported something outside itself. It must import no '
      + 'framework, no adapter, no sibling package and no Node builtin — that '
      + 'is what makes it runnable from a React Native app and testable with no '
      + 'database. If the thing you need is genuinely universal, restate it as a '
      + 'PORT and let an adapter provide it.',
    ).toEqual([]);
  });

  it('names no framework anywhere in its production source', () => {
    /*
     * A second, cruder check that catches what an import scan cannot: a global
     * reached without importing it. `window`, `document` and `process` are all
     * available at runtime without any import, and a domain module that reads
     * `process.env` has quietly become environment-dependent.
     *
     * It is crude on purpose, and it does have false positives — it caught a
     * local variable named `window` in the claims inspector. That local was
     * renamed rather than the check loosened: a framework-free package should
     * not name a DOM global at all, and a reader scanning for leakage should
     * not have to stop and work out which `window` this is.
     */
    const forbidden = [
      /\bwindow\./, /\bdocument\./, /\bprocess\.env\b/,
      /\blocalStorage\b/, /\bfetch\s*\(/,
    ];
    const offenders: string[] = [];

    for (const file of production) {
      const relative = file.slice(DOMAIN.length + 1).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const pattern of forbidden) {
        if (pattern.test(source)) offenders.push(`${relative} uses ${pattern.source}`);
      }
    }

    expect(
      offenders,
      'A domain module reached for a runtime global. The domain must be pure: '
      + 'time comes from the Clock port, randomness is injected, and anything '
      + 'environmental belongs to an adapter.',
    ).toEqual([]);
  });
});
