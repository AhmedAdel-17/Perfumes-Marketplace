import 'server-only';
import { postgresLoginCodes, type LoginCodeStore } from '@diyar/api';
import { database } from './db';

/**
 * Where this process keeps pending one-time codes — the composition root for
 * WORK_PLAN 11.2.
 *
 * ONE PER PROCESS, cached for the reason `mediaStore()` is: the seller sign-in
 * path, the operator sign-in path and anything that inspects the configuration
 * must all hold the very same store. Two instances would not be a correctness
 * problem here the way they are for media — both would talk to the same table —
 * but the pattern is the same and so is the reasoning, and a store constructed
 * per call site is one that will eventually be constructed differently at one
 * of them.
 *
 * There is no stub alternative and no environment branch. The Postgres store IS
 * the implementation: the in-memory one exists for tests that have no database,
 * and it is a test double rather than a declared stub — see the note in
 * `@diyar/api`'s `login-codes.ts` about why `assertProductionSafe` must not be
 * taught to refuse it.
 *
 * What still blocks sign-in going live is the SMS SENDER, which is a declared
 * stub and which the startup guard does refuse. That is DEBT_REGISTER #1's
 * actual remaining condition.
 */

declare global {
  // eslint-disable-next-line no-var
  var __diyarLoginCodes: LoginCodeStore | undefined;
}

export const loginCodes = (): LoginCodeStore =>
  (globalThis.__diyarLoginCodes ??= postgresLoginCodes(database()));
