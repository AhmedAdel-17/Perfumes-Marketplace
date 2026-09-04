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
    if (!/^\d{4}_/.test(file)) {
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

/*
 * The ledger, and the fact that the application cannot see it.
 *
 * It is INFRASTRUCTURE, not application data: it is written by whoever runs
 * migrations, connected as the owner, and no request ever touches it. So rather
 * than giving it a policy — which would imply some actor is meant to read it —
 * the application role is simply not granted anything on it.
 *
 * RLS is ENABLED but not FORCED, and that distinction matters here: `FORCE`
 * binds the table owner too, and the owner is exactly who has to write this row
 * while running a migration with no actor GUC set. Forcing it would make the
 * first migration fail on the statement that records the first migration.
 */
const LEDGER = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     filename text PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )`,
  'ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY',
].join(';');

/*
 * Taking the application's access away, AFTER the migrations have run.
 *
 * Migration 0002 ends with `GRANT ... ON ALL TABLES IN SCHEMA public TO
 * app_user`, which is the right thing for it to do and which sweeps this table
 * up with the rest. Revoking before that runs achieves nothing — the grant
 * follows and hands it straight back — so the revoke has to come last.
 */
const SEAL_LEDGER = 'REVOKE ALL ON schema_migrations FROM PUBLIC, app_user';

/**
 * Run every migration that has not run yet.
 *
 * A LEDGER, not a try/catch. The seeder runs against a database that persists
 * between runs, so re-applying `0000` raises "type already exists" — and the
 * version of this that swallowed that error would have swallowed a genuine
 * failure with the same shape, which is the whole problem with catching by
 * accident rather than recording by intent.
 *
 * A fresh database applies everything, so tests are unaffected: they each open
 * their own PGlite and the ledger starts empty.
 *
 * `--> statement-breakpoint` is Drizzle's marker for where it would split a
 * file into separate statements. PGlite's `exec` takes a whole script, so the
 * markers are stripped rather than honoured.
 */
export async function applyMigrations(
  db: SqlExecutor | SqlQueryable,
  options: { dir?: string; onApplied?: (file: string) => void } = {},
): Promise<string[]> {
  const dir = options.dir ?? MIGRATIONS_DIR;
  const applied: string[] = [];

  await db.exec(LEDGER);

  const done = new Set<string>();
  if ('query' in db) {
    const rows = await db.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    for (const row of rows.rows) done.add(row.filename);
  }

  for (const file of migrationFiles(dir)) {
    if (done.has(file)) continue;

    const sql = readFileSync(join(dir, file), 'utf8').replace(/--> statement-breakpoint/g, '');
    try {
      await db.exec(sql);
      // Recorded through `exec` so this works for a plain SqlExecutor too. The
      // filename is ours, from a directory listing, never user input.
      await db.exec(`INSERT INTO schema_migrations (filename) VALUES ('${file}')`);
    } catch (cause) {
      // Name the file. A migration failure reported only by its SQL error is a
      // hunt through nine files for the statement that produced it.
      throw new Error(`Migration ${file} failed: ${(cause as Error).message}`, { cause });
    }
    applied.push(file);
    options.onApplied?.(file);
  }

  // Last, for the reason above. `catch` because a database that has never run
  // 0002 has no `app_user` to revoke from, and a fresh test database is exactly
  // that until the migrations finish.
  await db.exec(SEAL_LEDGER).catch(() => undefined);

  return applied;
}
