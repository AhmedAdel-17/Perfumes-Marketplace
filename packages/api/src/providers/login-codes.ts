/**
 * Where one-time codes are kept (WORK_PLAN 11.2, DEBT_REGISTER #1).
 *
 * WHAT THIS REPLACES. A `Map` on `globalThis`, shared by the seller and
 * operator sign-in paths. It did not survive a restart and did not exist across
 * instances, so the day the web app runs on two containers roughly half of all
 * sign-ins fail — and the symptom ("the code is wrong") points at the SMS
 * provider, the phone, the clock, and never at this.
 *
 * It is also what the mobile apps force: a phone talks to whichever container
 * answers, and an in-process store means sign-in works or not depending on
 * which one that was.
 *
 * TWO IMPLEMENTATIONS, AND NEITHER IS A STUB. The Postgres one is the real
 * thing. The in-memory one exists so tests that have no database still exercise
 * the same interface — it is a test double, not a declared stub, and the
 * difference matters: `assertProductionSafe` refuses to boot holding a stub, and
 * refusing to start over a component that HAS a real implementation would blur
 * what that guard means for the providers where it is load-bearing.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DiyarDatabase } from '@diyar/db';
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  hashLoginCode,
  type CodeAudience,
  type CodeVerdict,
  type LoginCodeStore,
} from './session';

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const digest = (phone: string, code: string): string => hashLoginCode(phone, code, sha256);

const VERDICTS: readonly CodeVerdict[] = ['ok', 'wrong', 'expired', 'too_many_attempts'];

/**
 * Reading the function's answer without trusting it.
 *
 * `app.verify_login_code` returns text. If a future migration returned
 * something this code does not know — a new verdict, a renamed one — silently
 * treating it as a failure would be a sign-in that refuses everybody with
 * nothing anywhere saying why, and silently treating it as success would be
 * worse. So an unrecognised answer throws.
 */
export function asVerdict(value: unknown): CodeVerdict {
  const text = String(value);
  if (!VERDICTS.includes(text as CodeVerdict)) {
    throw new Error(
      `verify_login_code returned "${text}", which this build does not recognise. `
      + 'Refusing to guess whether that means the code was right.',
    );
  }
  return text as CodeVerdict;
}

/**
 * Drizzle's `execute` returns different shapes across drivers — an array for
 * PGlite, `{ rows }` for postgres-js. Reading both rather than picking one is
 * what lets the same adapter serve tests and production, which is the claim
 * `connect.ts` makes about this whole package.
 */
function firstRow<T>(result: unknown): T | undefined {
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  return rows[0] as T | undefined;
}

/**
 * The real one: codes in Postgres, through the functions 0025 defines.
 *
 * WHY EVERY OPERATION IS A FUNCTION CALL. `login_codes` has row-level security
 * forced and NO policies, so direct SQL reaches nothing — a read returns no
 * rows, an update or delete matches none, an insert is refused. That is the
 * design, not an obstacle: a path that can read the table can enumerate every
 * pending code in the system. The three `SECURITY DEFINER` functions are the
 * only way in, and each checks `app.is_identity()` on its first line.
 *
 * WHY IT OPENS ITS OWN TRANSACTION instead of going through `UnitOfWork`. That
 * class hands its work function a `Repositories` object, so every existing
 * caller reaches the database through a repository — and a repository for login
 * codes would put an authentication mechanism into the domain's repository
 * surface, which is exactly the coupling this port was placed in `providers/`
 * to avoid. Widening `UnitOfWork` to expose its executor for one caller is the
 * other way round and no better.
 *
 * So the ceremony below is deliberately duplicated and must not be "tidied"
 * into a repository: `set_config('app.actor_role', 'identity', true)` is what
 * satisfies the guard inside each function, and `SET LOCAL ROLE app_user` is
 * what stops a pool that happens to be connected as the owner running with more
 * authority than a request should ever have.
 */
export function postgresLoginCodes(db: DiyarDatabase): LoginCodeStore {
  const asIdentity = <T>(work: (tx: DiyarDatabase) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      const t = tx as unknown as DiyarDatabase;
      // Order matters: name the actor while still privileged, then drop the role.
      await t.execute(sql`SELECT set_config('app.actor_role', 'identity', true)`);
      await t.execute(sql`SELECT set_config('app.actor_id', '', true)`);
      await t.execute(sql.raw('SET LOCAL ROLE app_user'));
      return work(t);
    });

  return {
    async issue({ phone, audience, code }) {
      await asIdentity((t) => t.execute(sql`
        SELECT app.issue_login_code(
          ${phone}, ${audience}, ${digest(phone, code)}, ${Math.floor(CODE_TTL_MS / 1000)}
        )`));
    },

    async verify({ phone, audience, code }) {
      return asIdentity(async (t) => {
        const result = await t.execute(sql`
          SELECT app.verify_login_code(
            ${phone}, ${audience}, ${digest(phone, code)}, ${CODE_MAX_ATTEMPTS}
          ) AS verdict`);
        return asVerdict(firstRow<{ verdict?: unknown }>(result)?.verdict);
      });
    },
  };
}

/**
 * The in-memory store, for tests.
 *
 * Holds digests rather than codes, exactly as the table does. That is not
 * theatre: a double that stores plaintext would let a test pass that compared
 * the wrong thing, and the point of a double is to be wrong in the same places
 * as the real one and right in the same places too.
 */
export function inMemoryLoginCodes(now: () => number = Date.now): LoginCodeStore {
  interface Pending {
    readonly audience: CodeAudience;
    readonly codeDigest: string;
    readonly expiresAt: number;
    attempts: number;
  }
  const rows = new Map<string, Pending>();

  return {
    async issue({ phone, audience, code }) {
      // Expiry from this store's own clock, as the real one takes it from the
      // database's. Swept on issue, like the real one.
      for (const [key, pending] of rows) {
        if (pending.expiresAt <= now()) rows.delete(key);
      }
      rows.set(phone, {
        audience,
        codeDigest: digest(phone, code),
        expiresAt: now() + CODE_TTL_MS,
        attempts: 0,
      });
    },

    async verify({ phone, audience, code }) {
      const pending = rows.get(phone);
      // No pending code and a code for the other portal give the SAME answer as
      // an expired one, so neither the absence of an account nor which console a
      // number belongs to is observable by asking.
      if (!pending || pending.audience !== audience) return 'expired';

      if (now() >= pending.expiresAt) {
        rows.delete(phone);
        return 'expired';
      }

      // Counted before the comparison: a guess costs an attempt even when it is
      // malformed, or the ceiling is bypassed by sending nonsense.
      pending.attempts += 1;
      if (pending.attempts > CODE_MAX_ATTEMPTS) {
        rows.delete(phone);
        return 'too_many_attempts';
      }

      if (pending.codeDigest !== digest(phone, code)) return 'wrong';

      // Single use. A code that still works after it has been used is a code
      // that can be replayed from a screenshot.
      rows.delete(phone);
      return 'ok';
    },
  };
}
