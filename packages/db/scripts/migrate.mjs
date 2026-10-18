/** Explicit operator entrypoint; no .env auto-loading, seeding or deployment. */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyMigrations, MIGRATIONS_DIR, migrationChecksum, migrationFiles } from '../src/migrate.ts';
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const usage = 'Usage: pnpm --filter @diyar/db migrate -- --plan | --apply --confirm-target HOST/DATABASE [--adopt-legacy-checksums]';
if (args.length === 0 || args.includes('--help')) { console.log(usage); process.exit(args.includes('--help') ? 0 : 1); }
const mode = args[0];
const confirmationIndex = args.indexOf('--confirm-target');
const confirmation = confirmationIndex < 0 ? null : args[confirmationIndex + 1];
const allowed = new Set(['--plan', '--apply', '--confirm-target', '--adopt-legacy-checksums']);
if (args.filter((a) => a === '--plan' || a === '--apply').length !== 1 || args.filter((a) => a === '--confirm-target').length > 1 || !['--plan','--apply'].includes(mode) || args.some((a, i) => !allowed.has(a) && i !== confirmationIndex + 1)) {
  throw new Error(usage);
}
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL explicitly for the reviewed target; no fallback database.');
const target = new URL(process.env.DATABASE_URL);
const targetName = `${target.hostname}/${decodeURIComponent(target.pathname.slice(1))}`;
if (mode === '--apply' && confirmation !== targetName) throw new Error('Application requires --confirm-target HOST/DATABASE matching the reviewed target.');
if (mode !== '--apply' && args.includes('--adopt-legacy-checksums')) throw new Error('Legacy adoption is an explicit apply operation.');
const pool = postgres(process.env.DATABASE_URL, { max: 1 });
let connection;
try {
  connection = await pool.reserve();
  if (mode === '--plan') {
    const [exists] = await connection`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`;
    const rows = exists.present
      ? await connection`SELECT filename, to_jsonb(m)->>'sha256' AS sha256 FROM public.schema_migrations m ORDER BY filename`
      : [];
    const done = new Map(rows.map((row) => [row.filename, row.sha256]));
    console.log(`Read-only plan for ${targetName}`);
    for (const filename of migrationFiles()) {
      const checksum = migrationChecksum(readFileSync(join(MIGRATIONS_DIR, filename), 'utf8'));
      const state = !done.has(filename) ? 'pending' : done.get(filename) === null ? 'legacy-unverified'
        : done.get(filename) === checksum ? 'applied' : 'CHECKSUM-MISMATCH';
      console.log(`${state} ${filename} ${checksum}`);
    }
    for (const filename of done.keys()) {
      if (!migrationFiles().includes(filename)) console.log(`MISSING-FILE ${filename}`);
    }
  } else {
    const applied = await applyMigrations({
      exec: (sql) => connection.unsafe(sql),
      query: async (sql) => ({ rows: await connection.unsafe(sql) }),
    }, { adoptLegacyChecksums: args.includes('--adopt-legacy-checksums') });
    console.log(`Applied ${applied.length} migration(s) to ${targetName}`);
  }
} finally { if (connection) connection.release(); await pool.end(); }
