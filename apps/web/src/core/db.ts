import 'server-only';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema, DrizzleUnitOfWork, type ActorContext, type DiyarDatabase } from '@diyar/db';

/**
 * Development database.
 *
 * PGlite is a real Postgres compiled to WebAssembly, persisted to ./.data. That
 * means `pnpm dev` needs no Docker, no Supabase project and no connection
 * string — the same migrations, triggers and RLS policies run locally as in
 * production. In production this is postgres-js against Supabase; the Drizzle
 * code above it does not change.
 */
const DATA_DIR = process.env.PGLITE_DIR ?? './.data/pg';

declare global {
  // eslint-disable-next-line no-var
  var __diyarPg: PGlite | undefined;
}

// Next's dev server re-evaluates modules on every change; without this cache a
// second PGlite instance would try to open the same data directory and fail.
const client = (): PGlite => (globalThis.__diyarPg ??= new PGlite(DATA_DIR));

export const database = (): DiyarDatabase =>
  drizzle(client(), { schema }) as unknown as DiyarDatabase;

/** A Unit of Work scoped to the caller. Anonymous by default — the SEO surface. */
export const unitOfWork = (actor: ActorContext = { role: 'anon', id: null }) =>
  new DrizzleUnitOfWork(database(), actor);
