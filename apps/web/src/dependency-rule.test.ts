/**
 * The app's half of the dependency rule, enforced.
 *
 * ```
 * apps/web  →  @diyar/api  →  @diyar/domain  ←  @diyar/db
 * ```
 *
 * `packages/domain/src/dependency-rule.test.ts` guards the arrow that points at
 * nothing. This guards the one at the other end: **the application talks to the
 * API, and only its composition roots know a database exists** (ADR-10).
 *
 * WHY IT WAS NEEDED. Until task P3.4.1 the web app queried Postgres directly in
 * three files, through a connection that is a SUPERUSER — and Postgres never
 * applies row-level security to a superuser, whatever the policies say and
 * whatever GUC is set. So the busiest read path in the product and the reads
 * that decide who you are were the reads no policy governed. Nothing leaked,
 * because the catalogue is public and sign-in only ever matched on a number the
 * visitor had already typed. The danger was that it looked ordinary: a second
 * data path with different authority from the first, one import away from being
 * copied into a fourth file.
 *
 * WHY A TEST RATHER THAN A CONVENTION. The rule is invisible at the point of
 * violation. Importing `schema` and writing a query is shorter than going
 * through a procedure, it compiles, it works, and it is faster in development
 * where the whole database is in the same process. Nothing about doing it wrong
 * feels wrong, so the only thing that can hold the line is something that fails.
 *
 * WHY THIS FILE EXISTS AT ALL is also worth recording: `apps/web` had no unit
 * test runner before today — only `typecheck`, `e2e` and `audit` — so every
 * composition root in the application rested on the compiler alone. The runner
 * came with this rule because this rule had nowhere else honest to live.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname);

/**
 * The composition roots, and what each one is for.
 *
 * A root is a file whose ENTIRE job is to decide which implementation this
 * process uses. Keeping the reason beside the name is the point: an allow-list
 * without reasons becomes a list of files somebody once needed, and the next
 * person adds a fourth without anybody being able to say why the first three
 * are there.
 */
const COMPOSITION_ROOTS: readonly { readonly path: string; readonly because: string }[] = [
  {
    path: 'core/db.ts',
    because: 'THE root. It reads DATABASE_URL, refuses production without one, caches the '
      + 'connection, and hands out a Unit of Work scoped to an actor. Everything else in '
      + 'this list depends on it.',
  },
  {
    path: 'core/login-codes.ts',
    because: 'Builds the Postgres one-time-code store, one per process, the same shape '
      + 'mediaStore() uses. The store is constructed from a connection, so it needs one.',
  },
  {
    path: 'core/media.ts',
    because: 'Chooses R2 or the local-disk stub and builds it once. The choice is an '
      + 'environment decision, which is what a composition root is for.',
  },
  {
    path: 'core/identity.ts',
    because: 'Runs sign-in resolution as the `identity` service role. It names a role and '
      + 'builds a Unit of Work with it, which is a composition decision rather than a query.',
  },
  {
    path: 'core/api.ts',
    because: 'Assembles the context every procedure runs with: the actor, four service-role '
      + 'Units of Work, the media store and the payout switch. It imports the ActorContext '
      + 'type from @diyar/db, which is a type and not a query.',
  },
];

/** Every source file under `src`, tests and this file excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * An import of the database layer.
 *
 * Matches the package and the ORM, because reaching for either is the same
 * mistake wearing different clothes: `@diyar/db` gives you the schema and
 * `drizzle-orm` gives you the operators to query it with, and a file that has
 * both is writing SQL.
 */
const IMPORTS_DB = /from\s+['"](@diyar\/db|@diyar\/db\/\w+|drizzle-orm)['"]/;

const relative = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, '/');

/** Comments are stripped first: this file's own prose names the packages. */
const code = (file: string) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the instrument these cases depend on', () => {
  /*
   * Every case below filters a list and expects the result to be empty. A walk
   * that returned nothing — a renamed folder, a bad path, a filter that excluded
   * everything — would make all of them pass while proving nothing at all.
   */
  it('walked the application and found its files', () => {
    const files = sourceFiles(SRC).map(relative);
    expect(files.length).toBeGreaterThan(50);
    expect(files, 'the walk missed the composition roots it is meant to exempt')
      .toEqual(expect.arrayContaining(COMPOSITION_ROOTS.map((r) => r.path)));
  });

  it('recognises a database import when it sees one', () => {
    // The matcher itself, checked against the shapes it must catch and the ones
    // it must not. Without this the rule could be silently unable to match
    // anything and every case would stay green.
    expect(IMPORTS_DB.test("import { schema } from '@diyar/db';")).toBe(true);
    expect(IMPORTS_DB.test('import { eq } from "drizzle-orm";')).toBe(true);
    expect(IMPORTS_DB.test("import { schema } from '@diyar/db/schema';")).toBe(true);
    expect(IMPORTS_DB.test("import { api } from '@/core/api';")).toBe(false);
    expect(IMPORTS_DB.test("import { counted } from '@diyar/i18n';")).toBe(false);
  });
});

describe('the application talks to the API, not to the database', () => {
  it('imports @diyar/db or drizzle-orm only in a composition root', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !COMPOSITION_ROOTS.some((r) => relative(f) === r.path))
      .filter((f) => IMPORTS_DB.test(code(f)))
      .map(relative);

    expect(
      offenders,
      'A file outside a composition root imports the database layer. Every read in this '
      + 'system is supposed to run inside a Unit of Work, as a named actor, under the RLS '
      + 'policies in migration 0002 — and a direct query runs on a superuser connection '
      + 'where none of that applies. Add a procedure to @diyar/api and call it, or, if this '
      + 'genuinely is a composition root, add it to COMPOSITION_ROOTS with the reason.',
    ).toEqual([]);
  });

  it('calls database() only in a composition root', () => {
    // The stricter half of the same rule. `unitOfWork()` is fine anywhere — it
    // carries an actor and RLS applies. `database()` is the raw handle.
    const offenders = sourceFiles(SRC)
      .filter((f) => !COMPOSITION_ROOTS.some((r) => relative(f) === r.path))
      .filter((f) => /\bdatabase\(\)/.test(code(f)))
      .map(relative);

    expect(offenders, 'A file outside a composition root used the raw database handle.')
      .toEqual([]);
  });

  it('names a reason for every composition root', () => {
    for (const root of COMPOSITION_ROOTS) {
      expect(root.because.length, root.path).toBeGreaterThan(60);
    }
  });

  it('and every composition root still exists', () => {
    // A stale entry is a hole that opens the day somebody recreates the path it
    // names, with a different job.
    for (const root of COMPOSITION_ROOTS) {
      expect(() => statSync(join(SRC, root.path)), root.path).not.toThrow();
    }
  });
});
