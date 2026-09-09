/**
 * A house's contact details never reach a public read path.
 *
 * WHY THIS FILE EXISTS. RLS policies in Postgres are PERMISSIVE and OR'd
 * together, so `public_read_live_sellers` — `USING (status = 'live')`, with no
 * role predicate — admits every actor, anonymous traffic included, to the whole
 * ROW of any trading house. `contact_phone` and `contact_email` ride along on
 * that row, and Postgres has no column-level row security to stop them.
 *
 * WHY IT IS NOT FIXED IN SQL. The only database-level answer is to revoke the
 * table grant and re-grant every other column by name. That moves the failure
 * from "a query selected something it should not" — caught here, in CI — to
 * "somebody added a column and forgot to grant it", which fails at runtime in
 * front of a customer. Trading a caught failure for an uncaught one is not a
 * security improvement.
 *
 * SO THE PROTECTION IS THE QUERY SHAPE, and this is what holds it. Every read
 * of those two columns is enumerated below with the reason it is allowed. A new
 * one fails this test until somebody has justified it in writing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');

/**
 * Where a read of `sellers.contact_*` is legitimate, and why.
 *
 * Each entry is a path suffix. Keeping the reason beside the exemption is the
 * whole point: an allow-list with no reasons becomes a list of things somebody
 * once needed.
 */
const PERMITTED: readonly { readonly path: string; readonly because: string }[] = [
  {
    path: 'packages/db/src/application-repository.ts',
    because: 'The intake console. An operator has to be able to ring an applicant back, '
      + 'and every read there runs as the platform.',
  },
  {
    path: 'apps/web/src/features/seller/actions.ts',
    because: 'Seller sign-in resolves a phone to a house. It is a lookup predicate, not a '
      + 'disclosure — nothing is returned to the browser but a session.',
  },
  {
    path: 'apps/web/scripts/seed.ts',
    because: 'Development data. Never runs in production.',
  },
];

const SEARCH_ROOTS = [
  'apps/web/src',
  'apps/web/scripts',
  'packages/api/src',
  'packages/db/src',
];

/** Every source file under the roots, tests excluded. */
function sourceFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  const out: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      // Tests are allowed to read anything; they are what proves the rules.
      if (/\.test\.tsx?$/.test(entry) || /\.contract\.test\./.test(entry)) continue;
      out.push(full);
    }
  };

  walk(absolute);
  return out;
}

/**
 * A read of the seller contact columns.
 *
 * Matches both the Drizzle spelling and the raw SQL one, because this codebase
 * uses both and a guard that only knew one of them would be a guard the next
 * mistake walks straight past.
 */
const READS_CONTACT = /sellers\.contactPhone|sellers\.contactEmail|sellers\.contact_phone|sellers\.contact_email/;

describe('a house’s contact details stay off every public read path', () => {
  it('is read in exactly the places that have a reason to', () => {
    const offenders: string[] = [];

    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(root)) {
        const relative = file.slice(ROOT.length + 1).replace(/\\/g, '/');
        if (PERMITTED.some((p) => relative.endsWith(p.path))) continue;

        const source = readFileSync(file, 'utf8');
        // Strip comments first: this very file's own prose names the columns,
        // and so does the migration note that explains the rule.
        const code = source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');

        if (READS_CONTACT.test(code)) offenders.push(relative);
      }
    }

    expect(
      offenders,
      'A new read of sellers.contact_phone / contact_email. Anonymous traffic can '
      + 'already reach the whole row through the public RLS policy, so the only thing '
      + 'keeping these columns private is that no public query selects them. Either '
      + 'this read runs as the platform — in which case add it to PERMITTED with the '
      + 'reason — or it does not, in which case it must not select these columns.',
    ).toEqual([]);
  });

  it('names a reason for every exemption', () => {
    // An allow-list with no reasons becomes a list of things somebody once
    // needed and nobody can now remove.
    for (const entry of PERMITTED) {
      expect(entry.because.length, entry.path).toBeGreaterThan(40);
    }
  });

  it('every exemption still points at a file that exists', () => {
    // A stale exemption is a hole that opens the day somebody recreates the
    // path it names.
    for (const entry of PERMITTED) {
      expect(() => statSync(join(ROOT, entry.path)), entry.path).not.toThrow();
    }
  });
});
