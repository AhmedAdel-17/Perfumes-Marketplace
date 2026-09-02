/**
 * The dependency rule, enforced rather than asserted.
 *
 * ENGINEERING_PRINCIPLES §1 says: "open any file in packages/domain and look at
 * its imports. If you see a library name, it is a bug. This is enforced in CI."
 *
 * That sentence was a claim until this file existed. Now it is a fact: the test
 * walks every source file in the package and fails the build on the first
 * framework import.
 *
 * Why it matters here specifically — the money logic must be provable in
 * isolation and identical across six apps. The moment `domain` can reach a
 * database client or a React hook, it stops being portable and starts being
 * untestable, and the drift is invisible until someone reimplements commission
 * in the mobile app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname);

/** Anything that would tie the domain to a runtime, a framework or an I/O path. */
const FORBIDDEN = [
  'react', 'react-dom', 'react-native', 'expo',
  'next', 'next/navigation', 'next/server',
  'drizzle-orm', 'postgres', 'pg', '@supabase/supabase-js',
  '@trpc/server', '@trpc/client',
  'axios', 'node-fetch', 'undici',
  'zod',                       // belongs at the API boundary, not in the core
  '@diyar/db', '@diyar/api', '@diyar/ui', '@diyar/tokens',
];

/** Node built-ins are I/O too. Permitted in tests only. */
const NODE_BUILTINS = /^(node:)?(fs|path|http|https|crypto|os|child_process|net|worker_threads)$/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return extname(full) === '.ts' ? [full] : [];
  });

/**
 * Comments are stripped before scanning.
 *
 * The first version matched raw text, so a doc comment containing the words
 * `from "absent" to "present and undefined"` was read as an import of a module
 * called "present and undefined". A guard that cries wolf gets switched off,
 * which is worse than having no guard at all.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const importsOf = (file: string): string[] => {
  const src = stripComments(readFileSync(file, 'utf8'));
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) specifiers.push(m[1]!);
  }
  return specifiers;
};

const productionFiles = sourceFiles(SRC).filter((f) => !f.endsWith('.test.ts'));

describe('the dependency rule', () => {
  it('has production sources to check', () => {
    expect(productionFiles.length).toBeGreaterThan(5);
  });

  it('no production file imports a framework, a database or an HTTP client', () => {
    const violations: string[] = [];

    for (const file of productionFiles) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('.')) continue;                     // internal
        const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
        if (FORBIDDEN.includes(root) || FORBIDDEN.includes(spec)) {
          violations.push(`${relative(SRC, file)} imports "${spec}"`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('no production file imports a Node built-in — the domain performs no I/O', () => {
    const violations: string[] = [];

    for (const file of productionFiles) {
      for (const spec of importsOf(file)) {
        if (NODE_BUILTINS.test(spec)) {
          violations.push(`${relative(SRC, file)} imports "${spec}"`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('imports only relative paths — the domain has no external dependencies at all', () => {
    const external = new Set<string>();

    for (const file of productionFiles) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) external.add(spec);
      }
    }

    expect([...external]).toEqual([]);
  });
});

describe('the clock rule', () => {
  it('no production file calls new Date() or Date.now()', () => {
    // ENGINEERING_PRINCIPLES §2: time is injected, because SLA clocks, reserve
    // periods and attribution windows are all time-dependent money logic and
    // must be testable at any instant.
    const violations: string[] = [];

    for (const file of productionFiles) {
      if (file.endsWith(join('ports', 'clock.ts'))) continue;   // the one allowed place
      const src = stripComments(readFileSync(file, 'utf8'));
      if (/\bnew Date\(\s*\)/.test(src)) violations.push(`${relative(SRC, file)}: new Date()`);
      if (/\bDate\.now\(\)/.test(src)) violations.push(`${relative(SRC, file)}: Date.now()`);
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});

describe('the money rule', () => {
  it('no production file outside Money does floating-point arithmetic on currency', () => {
    // Money holds integer piastres. A `* 0.05` anywhere else is a rate applied
    // as a float, which is the bug class the value object exists to prevent.
    const violations: string[] = [];

    for (const file of productionFiles) {
      if (file.endsWith(join('value-objects', 'money.ts'))) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/[*/]\s*0\.\d+/g)) {
        violations.push(`${relative(SRC, file)}: "${m[0].trim()}"`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('no production file uses parseFloat or Number() on a money-shaped name', () => {
    const violations: string[] = [];

    for (const file of productionFiles) {
      if (file.endsWith(join('value-objects', 'money.ts'))) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/parseFloat\s*\(\s*\w*(?:price|amount|total|piastres)\w*/gi)) {
        violations.push(`${relative(SRC, file)}: "${m[0]}"`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
