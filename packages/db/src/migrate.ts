/**
 * Apply every migration, in order, from the directory that holds them.
 *
 * THE LIST WAS WRITTEN OUT BY HAND IN SEVEN PLACES — five test files, the
 * seeder, and the API's fixture. Adding a migration meant editing all seven,
 * and the failure mode when you miss one is not an error: the schema is simply
 * older than the code expects, and it surfaces far away as a missing column in
 * a query nobody has touched. That has already happened twice here, once
 * through a `runSql` signature that silently dropped its second argument.
 *
 * So the list is gone. The directory is the list. A new migration is a new
 * file, and nothing else anywhere has to change.
 *
 * Ordering is by filename, which is why they are numbered with a fixed width.
 * That is asserted below rather than assumed, because a file named `10_x.sql`
 * sorts before `2_x.sql` and would run the schema out of order — quietly, and
 * only on the machine that had not run the earlier ones already.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * Anything with an `exec` — PGlite, or a pg client wrapper.
 *
 * Named `SqlExecutor` rather than `Executor` because the repositories use that
 * word for something else entirely (a Drizzle database handle), and two
 * different `Executor` types exported from one package is a collision waiting
 * to be imported wrongly.
 */
export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
}

export const MIGRATIONS_DIR = join(import.meta.dirname, '../migrations');

/** Every migration filename, in the order they must be applied. */
export function migrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    // A four-digit prefix, so lexicographic order is numeric order. Without it
    // `0010` and `2` sort in the wrong direction and the schema is built in an
    // order nobody chose.
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
      throw new Error(
        `Migration "${file}" does not start with a four-digit number. `
        + 'Files are applied in filename order, so the prefix is what fixes it.',
      );
    }
  }

  const numbers = files.map((f) => Number(f.slice(0, 4)));
  numbers.forEach((n, i) => {
    if (n !== i) {
      throw new Error(
        `Migrations are numbered with a gap or a duplicate at ${files[i]}: `
        + `expected ${String(i).padStart(4, '0')}. A gap usually means a file `
        + 'was renamed and a duplicate means two branches picked the same number.',
      );
    }
  });

  return files;
}

/** Anything that can also be queried, so the ledger can be read back. */
export interface SqlQueryable extends SqlExecutor {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Canonical LF hashes survive Git's Windows checkout conversion. */
export function migrationChecksum(source: string): string {
  return createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Pattern — serialized transactional migration batch + content-addressed ledger.
 * Supply a DEDICATED connection, not an unpinned multi-connection pool. The lock,
 * DDL and markers share one transaction; a failed batch leaves none of them.
 * Nontransactional operations (e.g. concurrent indexes) need a separate reviewed
 * operational plan, not an automatic escape from this boundary.
 * Legacy filename-only records cannot prove historical bytes. Adoption requires
 * explicit operator opt-in after reviewing the historical baseline.
 */
export async function applyMigrations(
  db: SqlExecutor | SqlQueryable,
  options: {
    dir?: string;
    onApplied?: (file: string) => void;
    adoptLegacyChecksums?: boolean;
  } = {},
): Promise<string[]> {
  if (!('query' in db)) {
    throw new Error('Migration runner requires query support on a dedicated connection; exec-only replay is unsafe.');
  }
  const dir = options.dir ?? MIGRATIONS_DIR;
  const sources = migrationFiles(dir).map((filename) => {
    const source = readFileSync(join(dir, filename), 'utf8');
    return { filename, source, checksum: migrationChecksum(source) };
  });
  const applied: string[] = [];
  let active = 'migration ledger';
  await db.exec('BEGIN');
  try {
    await db.exec("SELECT pg_advisory_xact_lock(hashtextextended('diyar:migrations', 0))");
    await db.exec(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      sha256 text
    ); ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS sha256 text;
    ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY`);
    const { rows } = await db.query<{ filename: string; sha256: string | null }>(
      'SELECT filename, sha256 FROM public.schema_migrations ORDER BY filename');
    for (const [index, row] of rows.entries()) {
      active = row.filename;
      const expected = sources[index];
      if (!expected || row.filename !== expected.filename) {
        throw new Error('Applied migration history is missing, reordered or not present in this checkout.');
      }
      if (row.sha256 === null) {
        if (!options.adoptLegacyChecksums) {
          throw new Error('Legacy migration has no fingerprint. Review history/backup, then explicitly adopt legacy checksums; historical bytes cannot be verified.');
        }
        await db.exec(`UPDATE public.schema_migrations SET sha256='${expected.checksum}' WHERE filename='${row.filename}'`);
      } else if (row.sha256 !== expected.checksum) {
        throw new Error('Applied migration checksum differs from this checkout. Historical SQL must not be edited.');
      }
    }
    for (const migration of sources.slice(rows.length)) {
      active = migration.filename;
      await db.exec(migration.source.replace(/--> statement-breakpoint/g, ''));
      await db.exec(`INSERT INTO public.schema_migrations(filename,sha256) VALUES ('${migration.filename}','${migration.checksum}')`);
      applied.push(migration.filename);
    }
    await db.exec('ALTER TABLE public.schema_migrations ALTER COLUMN sha256 SET NOT NULL');
    // No swallowed permission errors. Early historical fixtures may predate
    // app_user; the real role's presence requires a successful seal.
    await db.exec(`REVOKE ALL ON public.schema_migrations FROM PUBLIC;
      DO $seal$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN
          REVOKE ALL ON public.schema_migrations FROM app_user;
        END IF;
      END $seal$`);
    await db.exec('COMMIT');
  } catch (cause) {
    await db.exec('ROLLBACK');
    throw new Error(`Migration ${active} failed: ${(cause as Error).message}`, { cause });
  }
  // A rolled-back batch must never be reported as successfully applied.
  for (const file of applied) options.onApplied?.(file);
  return applied;
}
