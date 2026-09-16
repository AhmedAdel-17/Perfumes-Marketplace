/**
 * One-time codes, against a real database (WORK_PLAN 11.2, DEBT_REGISTER #1).
 *
 * THE POINT. `login-codes.test.ts` runs every rule against the in-memory store;
 * this file runs the IDENTICAL list against Postgres, through migration 0025's
 * functions. Neither run is worth much alone: a double that is wrong where the
 * table is right is the same mistake as the fixture the September pass found —
 * fine for months precisely because it was broken, since nothing ever exercised
 * the path that would have failed.
 *
 * What this adds beyond the shared cases is everything that only exists in the
 * database: that the row holds a digest and never the code, that expiry comes
 * from the database's own clock, that each function refuses an actor who is not
 * signing in, and — the guarantee the whole design rests on — that direct SQL
 * reaches nothing at all.
 *
 * A NOTE ON HOW THIS TEST TOUCHES THE TABLE. `login_codes` has row-level
 * security forced and no policies, so the only way in is the functions. The
 * inspections below use raw `pg.query`, which in PGlite connects as `postgres`
 * — a superuser, and superusers bypass RLS even under FORCE. That bypass is a
 * property of the test harness, never of the application: every application
 * path in this codebase runs `SET LOCAL ROLE app_user` first, and the case
 * "direct SQL reaches nothing" below proves what that role can actually do.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schema, type DiyarDatabase } from '@diyar/db';
import { applyMigrations } from '@diyar/db/migrate';
import { CODE_MAX_ATTEMPTS, type LoginCodeStore } from './session';
import { postgresLoginCodes } from './login-codes';
import { loginCodeCases } from './login-codes.test';

const PHONE = '01001234567';
const CODE = '042513';

let pg: PGlite;
let db: DiyarDatabase;
let store: LoginCodeStore;

beforeAll(async () => {
  pg = new PGlite();
  await applyMigrations(pg);
  db = drizzle(pg, { schema }) as unknown as DiyarDatabase;
  store = postgresLoginCodes(db);
}, 180_000);

afterAll(async () => { await pg?.close(); });

beforeEach(async () => {
  // Each case starts from nothing. The table is keyed on the phone, so a row
  // left behind by one case would silently satisfy the next one's `issue`.
  await pg.exec('DELETE FROM login_codes');
});

describe('one-time codes — Postgres, the real store', () => {
  for (const testCase of loginCodeCases) {
    it(testCase.name, async () => {
      await testCase.run(store);
    });
  }
});

describe('what only the database can promise', () => {
  it('stores a digest, and nowhere stores the code', async () => {
    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

    const rows = await pg.query<{ code_digest: string; phone: string; audience: string }>(
      'SELECT code_digest, phone, audience FROM login_codes');

    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0]!;
    // A table is dumped, replicated and restored. A plaintext one-time code in
    // a backup is a credential in a backup.
    expect(row.code_digest).not.toContain(CODE);
    expect(row.code_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(row.phone).toBe(PHONE);
    expect(row.audience).toBe('seller');
  });

  it('direct SQL reaches nothing, even holding the sign-in role', async () => {
    /*
     * THE GUARANTEE THE DESIGN RESTS ON.
     *
     * There are no policies on this table, so an application connection — which
     * always drops to `app_user` — can do nothing with it directly: a read finds
     * no rows, a write is refused, a delete matches none. Only the guarded
     * definer functions get in. Without this case, "no policies" is an
     * assertion about the migration file rather than about what the database
     * actually permits.
     */
    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

    await db.transaction(async (tx) => {
      const t = tx as unknown as DiyarDatabase;
      await t.execute(sql`SELECT set_config('app.actor_role', 'identity', true)`);
      await t.execute(sql.raw('SET LOCAL ROLE app_user'));

      const read = await t.execute(sql`SELECT phone FROM login_codes`);
      const rows = (Array.isArray(read) ? read : (read as { rows?: unknown[] }).rows) ?? [];
      expect(rows).toHaveLength(0);

      /*
       * Asserted against the CAUSE, not the message.
       *
       * Drizzle wraps a driver error in "Failed query: …" and the sentence that
       * says why is underneath it, so matching on the thrown error's own message
       * tests the wrapper and passes for anything that fails at all — including
       * a syntax error, which would prove the opposite of what is claimed here.
       */
      const refusal = await t.execute(sql`
        INSERT INTO login_codes (phone, audience, code_digest, expires_at)
        VALUES ('01555555555', 'seller', ${'a'.repeat(64)}, now() + interval '5 minutes')`)
        .then(() => null, (error: unknown) => error);

      expect(refusal).toBeInstanceOf(Error);
      const causes: string[] = [];
      for (let e: unknown = refusal; e instanceof Error; e = (e as { cause?: unknown }).cause) {
        causes.push(e.message);
      }
      expect(causes.join(' | ')).toMatch(/row-level security/);
    });

    // And the row the application could not see is still there, untouched.
    const after = await pg.query<{ phone: string }>('SELECT phone FROM login_codes');
    expect(after.rows.map((r) => r.phone)).toEqual([PHONE]);
  });

  it('refuses every operation to an actor who is not signing in', async () => {
    /*
     * The functions are SECURITY DEFINER — they run as the owner and bypass RLS,
     * which is the only reason a table with no policies is usable at all. The
     * guard on each one's first line is therefore the whole of its protection:
     * EXECUTE is granted to PUBLIC by default and every actor on this system
     * connects as the same database role.
     */
    await pg.exec(`SET app.actor_role='platform';`);

    await expect(pg.query(`SELECT app.issue_login_code($1,'seller',$2,300)`, [PHONE, 'a'.repeat(64)]))
      .rejects.toThrow(/sign-in operation/);
    await expect(pg.query(`SELECT app.verify_login_code($1,'seller',$2,5)`, [PHONE, 'a'.repeat(64)]))
      .rejects.toThrow(/sign-in operation/);
    await expect(pg.query('SELECT app.purge_expired_login_codes()'))
      .rejects.toThrow(/sign-in operation/);

    await pg.exec('RESET app.actor_role;');
  });

  it('refuses a digest that is not a digest, and an audience it does not know', async () => {
    // The columns are constrained rather than merely documented: a column that
    // accepts anything eventually holds something else, and the thing it would
    // hold here is the plaintext this table exists to avoid.
    await pg.exec(`SET app.actor_role='identity';`);

    await expect(pg.query(`SELECT app.issue_login_code($1,'seller',$2,300)`, [PHONE, CODE]))
      .rejects.toThrow(/login_codes_digest_shape/);
    await expect(pg.query(`SELECT app.issue_login_code($1,'accounting',$2,300)`, [PHONE, 'a'.repeat(64)]))
      .rejects.toThrow(/login_codes_audience_known/);

    await pg.exec('RESET app.actor_role;');
  });

  it('refuses a lifetime that is not a lifetime', async () => {
    // Zero or negative would store a code that is already dead, which reads to
    // a person as "the code never works" and to a log as nothing at all.
    await pg.exec(`SET app.actor_role='identity';`);
    await expect(pg.query(`SELECT app.issue_login_code($1,'seller',$2,0)`, [PHONE, 'a'.repeat(64)]))
      .rejects.toThrow(/ttl_seconds must be at least 1/);
    await pg.exec('RESET app.actor_role;');
  });

  it('expires by the clock in the database, not by one the caller supplies', async () => {
    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

    // Backdated directly, which only the harness can do. The store has no way
    // to express "already expired", and that is the point: expiry is the
    // database's to decide, so a skewed container clock cannot extend a code.
    await pg.query(`UPDATE login_codes SET expires_at = now() - interval '1 second' WHERE phone = $1`,
      [PHONE]);

    expect(await store.verify({ phone: PHONE, audience: 'seller', code: CODE })).toBe('expired');
  });

  it('sweeps expired rows when the next code is issued', async () => {
    const stale = '01111111111';
    await store.issue({ phone: stale, audience: 'seller', code: CODE });
    await pg.query(`UPDATE login_codes SET expires_at = now() - interval '1 second' WHERE phone = $1`,
      [stale]);

    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

    // Bounded by the number of people signing in, rather than by the number who
    // ever have. There is no scheduler in this system to do it any other way.
    const rows = await pg.query<{ phone: string }>('SELECT phone FROM login_codes');
    expect(rows.rows.map((r) => r.phone)).toEqual([PHONE]);
  });

  it('counts attempts on the row, so the ceiling is the database’s and not the caller’s', async () => {
    await store.issue({ phone: PHONE, audience: 'seller', code: CODE });

    await store.verify({ phone: PHONE, audience: 'seller', code: '111111' });
    await store.verify({ phone: PHONE, audience: 'seller', code: '111111' });

    const rows = await pg.query<{ attempts: number }>('SELECT attempts FROM login_codes');
    expect(rows.rows[0]?.attempts).toBe(2);
    expect(CODE_MAX_ATTEMPTS).toBe(5);
  });
});
