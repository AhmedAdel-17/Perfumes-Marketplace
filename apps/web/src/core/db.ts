import 'server-only';
import { connect, DrizzleUnitOfWork, type ActorContext, type DiyarDatabase } from '@diyar/db';

/**
 * The database, for this process.
 *
 * Which DRIVER is used is decided by `@diyar/db`'s `connect` — see the note
 * there. This file is only the composition root: it reads the environment,
 * refuses to start production without a real database, and caches the
 * connection.
 */

const connectionString = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __diyarConnection: ReturnType<typeof connect> | undefined;
}

/**
 * Cached on `globalThis`, in BOTH modes.
 *
 * Next's dev server re-evaluates modules on every change; without this a second
 * PGlite instance would try to open the same data directory and fail. In
 * production the same cache is what stops a connection pool being built per
 * module instance — which is how a deploy exhausts a database's connection
 * limit while serving very little traffic.
 */
const connection = () => (globalThis.__diyarConnection ??= open());

/**
 * Production with no `DATABASE_URL` is refused rather than falling back to the
 * embedded database.
 *
 * A silent fallback is how a marketplace runs for a day and then loses every
 * order on a routine restart — with nothing in any log to say why, because
 * nothing went wrong.
 *
 * Checked HERE, at the first connection, and not at module load. `next build`
 * sets `NODE_ENV=production` and imports every module to collect page data, so
 * a module-scope throw failed the build on a machine that has no database and
 * needs none. The deploy-time half of this guarantee lives in
 * `instrumentation.ts`, which runs once per server process and never during a
 * build — so the failure still arrives when somebody is watching rather than on
 * a customer's first request.
 */
function open() {
  if (!connectionString && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is required in production. Refusing to run against an '
      + 'embedded database: it lives on the container disk, is not shared '
      + 'between instances, and does not survive a restart.',
    );
  }

  return connect({
    connectionString,
    dataDir: process.env.PGLITE_DIR ?? './.data/pg',
    poolMax: process.env.DATABASE_POOL_MAX
      ? Number(process.env.DATABASE_POOL_MAX)
      : undefined,
  });
}

export const database = (): DiyarDatabase => connection().db;

/** True when this process is talking to a real Postgres server. */
export const isProductionDatabase = (): boolean => connection().isRemote;

/** A Unit of Work scoped to the caller. Anonymous by default — the SEO surface. */
export const unitOfWork = (actor: ActorContext = { role: 'anon', id: null }) =>
  new DrizzleUnitOfWork(database(), actor);
