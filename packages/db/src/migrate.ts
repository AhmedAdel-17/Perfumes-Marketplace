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

/**
 * Run them all.
 *
 * `--> statement-breakpoint` is Drizzle's marker for where it would split a
 * file into separate statements. PGlite's `exec` takes a whole script, so the
 * markers are stripped rather than honoured.
 */
export async function applyMigrations(
  db: SqlExecutor,
  options: { dir?: string; onApplied?: (file: string) => void } = {},
): Promise<string[]> {
  const dir = options.dir ?? MIGRATIONS_DIR;
  const applied: string[] = [];

  for (const file of migrationFiles(dir)) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/--> statement-breakpoint/g, '');
    try {
      await db.exec(sql);
    } catch (cause) {
      // Name the file. A migration failure reported only by its SQL error is a
      // hunt through nine files for the statement that produced it.
      throw new Error(`Migration ${file} failed: ${(cause as Error).message}`, { cause });
    }
    applied.push(file);
    options.onApplied?.(file);
  }

  return applied;
}
