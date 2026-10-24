/** Focused migration safety; disposable databases and temporary SQL only. */
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, migrationChecksum, migrationFiles, MIGRATIONS_DIR } from './migrate';
let db: PGlite;
let dir: string;
const sql = 'CREATE TABLE example(id integer PRIMARY KEY);';
beforeEach(() => { db = new PGlite(); dir = mkdtempSync(join(tmpdir(), 'diyar-migration-safety-')); });
afterEach(async () => { await db?.close(); });
const file = (name: string, contents: string) => writeFileSync(join(dir, name), contents);
const exists = async (name: string) => (await db.query<{ found: boolean }>(
  'SELECT to_regclass($1) IS NOT NULL AS found', [name])).rows[0]!.found;
describe('serialized atomic migration ledger', () => {
  it('records fingerprints and makes a second run a no-op', async () => {
    file('0000_example.sql', sql);
    expect(await applyMigrations(db, { dir })).toEqual(['0000_example.sql']);
    expect(await applyMigrations(db, { dir })).toEqual([]);
    expect((await db.query('SELECT sha256 FROM schema_migrations')).rows)
      .toEqual([{ sha256: migrationChecksum(sql) }]);
    expect(migrationChecksum('a\r\nb')).toBe(migrationChecksum('a\nb'));
  });
  it('rolls back the whole batch and publishes no success callbacks on failure', async () => {
    file('0000_example.sql', sql);
    file('0001_broken.sql', 'CREATE TABLE abandoned(id integer); SELECT nonexistent_function();');
    const announced: string[] = [];
    await expect(applyMigrations(db, { dir, onApplied: (name) => { announced.push(name); } })).rejects.toThrow('0001_broken.sql');
    expect(await exists('example')).toBe(false);
    expect(await exists('abandoned')).toBe(false);
    expect(await exists('schema_migrations')).toBe(false);
    expect(announced).toEqual([]);
    file('0001_broken.sql', 'CREATE TABLE recovered(id integer);');
    expect(await applyMigrations(db, { dir })).toHaveLength(2);
  });
  it('rejects edits to applied SQL before executing pending migrations', async () => {
    file('0000_example.sql', sql);
    await applyMigrations(db, { dir });
    file('0000_example.sql', sql + ' -- edited');
    file('0001_pending.sql', 'CREATE TABLE pending(id integer);');
    await expect(applyMigrations(db, { dir })).rejects.toThrow('checksum differs');
    expect(await exists('pending')).toBe(false);
  });
  it('requires explicit legacy adoption and preserves the historical row', async () => {
    file('0000_example.sql', sql);
    await db.exec(sql + " CREATE TABLE schema_migrations(filename text PRIMARY KEY,applied_at timestamptz DEFAULT now()); INSERT INTO schema_migrations(filename) VALUES ('0000_example.sql');");
    const before = (await db.query('SELECT applied_at FROM schema_migrations')).rows;
    await expect(applyMigrations(db, { dir })).rejects.toThrow('Legacy migration');
    expect(await applyMigrations(db, { dir, adoptLegacyChecksums: true })).toEqual([]);
    expect((await db.query('SELECT applied_at FROM schema_migrations')).rows).toEqual(before);
    expect(await exists('example')).toBe(true);
  });
  it('refuses an applied history missing from this checkout', async () => {
    file('0000_example.sql', sql);
    await applyMigrations(db, { dir });
    await expect(applyMigrations(db, { dir: mkdtempSync(join(tmpdir(), 'diyar-missing-history-')) }))
      .rejects.toThrow('missing, reordered');
  });
  it('does not hide ledger-sealing failures', async () => {
    file('0000_example.sql', sql);
    await expect(applyMigrations({
      query: <T>(statement: string, params?: unknown[]) => db.query<T>(statement, params),
      exec: async (statement: string) => {
        if (statement.startsWith('REVOKE ALL')) throw new Error('seal denied');
        return db.exec(statement);
      },
    }, { dir })).rejects.toThrow('seal denied');
    expect(await exists('example')).toBe(false);
  });
  it('refuses an exec-only adapter rather than blindly replaying history', async () => {
    await expect(applyMigrations({ exec: (statement: string) => db.exec(statement) }, { dir }))
      .rejects.toThrow('requires query support');
  });
});


it('upgrades a populated main-era legacy store without changing customer data or migration timestamps', async () => {
  for (const name of migrationFiles().filter((name) => name < '0038')) {
    file(name, readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
  }
  await applyMigrations(db, { dir });
  await db.exec("SET app.actor_role='platform'");
  await db.exec("INSERT INTO customers(phone,full_name) VALUES('01012345678','Preserved customer')");
  const before = (await db.query('SELECT * FROM customers')).rows;
  const stamps = (await db.query('SELECT filename,applied_at FROM schema_migrations ORDER BY filename')).rows;
  // Reproduce the filename-only ledger used by existing main local stores.
  await db.exec('ALTER TABLE schema_migrations ALTER COLUMN sha256 DROP NOT NULL; UPDATE schema_migrations SET sha256=NULL');
  await expect(applyMigrations(db)).rejects.toThrow('Legacy migration');
  expect(await applyMigrations(db, { adoptLegacyChecksums: true })).toHaveLength(4);
  expect((await db.query('SELECT * FROM customers')).rows).toEqual(before);
  expect((await db.query("SELECT filename,applied_at FROM schema_migrations WHERE filename < '0038' ORDER BY filename")).rows).toEqual(stamps);
  expect(await applyMigrations(db)).toEqual([]);
}, 180_000);
