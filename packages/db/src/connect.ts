/**
 * Opening the database.
 *
 * TWO DRIVERS, ONE ADAPTER. Everything above this file — the repositories, the
 * Unit of Work, the RLS role switching — is written against Drizzle's
 * driver-agnostic `PgDatabase` and does not change between them. What changes
 * is this file.
 *
 * WHY IT LIVES HERE rather than in the web app. `postgres` and `@electric-sql/
 * pglite` are dependencies of THIS package, and under pnpm's strict layout an
 * app that imports them without declaring them is an app that builds on one
 * machine and not another. More to the point: which driver is in use is a
 * database concern, and the app has no business knowing.
 *
 * WHY IT EXISTS AT ALL. The web app constructed PGlite unconditionally under a
 * comment that said "in production this is postgres-js against Supabase".
 * `postgres` was in `package.json`, imported by nothing. So there was no
 * production database adapter: a deploy would have run against a file on the
 * container's local disk, losing every order on the next restart and sharing
 * nothing between instances.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';
import type { DiyarDatabase } from './repositories';

export interface ConnectionOptions {
  /**
   * A real Postgres server. Its PRESENCE is what selects the driver — not
   * `NODE_ENV`.
   *
   * Two reasons. A staging or preview build wants the real driver without
   * pretending to be production, and somebody debugging against a copy of the
   * production database should not have to lie about the environment to do it.
   */
  readonly connectionString?: string | undefined;
  /** Where the embedded database lives, when there is no connection string. */
  readonly dataDir?: string | undefined;
  readonly poolMax?: number | undefined;
}

export interface Connection {
  readonly db: DiyarDatabase;
  /** True when this process is talking to a real Postgres server. */
  readonly isRemote: boolean;
  close(): Promise<void>;
}

export function connect(options: ConnectionOptions = {}): Connection {
  const { connectionString } = options;

  if (connectionString) {
    /*
     * `prepare: false` is required behind a TRANSACTION POOLER.
     *
     * Supabase's pooler in transaction mode hands a different backend
     * connection to each statement, so a prepared statement created on one is
     * unknown to the next — and the failure is intermittent, load-dependent,
     * and looks like anything except this. It costs a little planning time and
     * buys a deployment that works behind a pooler, which is the only way this
     * is actually going to be deployed.
     */
    const sql = postgres(connectionString, {
      prepare: false,
      max: options.poolMax ?? 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    return {
      db: drizzlePostgres(sql, { schema }) as unknown as DiyarDatabase,
      isRemote: true,
      close: () => sql.end(),
    };
  }

  /*
   * Development. PGlite is a real Postgres compiled to WebAssembly, persisted
   * to disk — the same migrations, triggers and RLS policies run locally as in
   * production, with no Docker and no connection string.
   */
  const client = new PGlite(options.dataDir ?? './.data/pg');

  return {
    db: drizzlePglite(client, { schema }) as unknown as DiyarDatabase,
    isRemote: false,
    close: () => client.close(),
  };
}
