/**
 * Startup checks.
 *
 * WHY THIS FILE EXISTS. `assertProductionSafe` was written to refuse a
 * production boot holding a stub provider — an OTP sender that prints the code
 * to the console, a payment gateway that authorises everything. Six files
 * describe it as doing exactly that. Nothing called it.
 *
 * So the guarantee was a comment. A production deploy would have started
 * happily with `consoleOtpSender` configured, which is account takeover for
 * anybody who can read a log line, and it would have said nothing about it.
 *
 * Next runs this once per server process, before the first request. That is the
 * only place a "refuse to start" check can actually refuse to start. The checks
 * themselves are in `instrumentation-node.ts`.
 *
 * THE SHAPE OF THE IMPORT BELOW IS LOAD-BEARING. Next compiles this file for
 * the edge runtime as well as for Node, replacing `process.env.NEXT_RUNTIME`
 * with a constant in each build — so an import INSIDE `if (NEXT_RUNTIME ===
 * 'nodejs')` is dead code in the edge build and removed with its whole module
 * graph. Two other shapes were tried and both put `node:crypto` into the edge
 * compile, failing it and turning every page into a 500:
 *
 *   - a top-level import, guarded only by a runtime check before use;
 *   - an early `return` for the edge runtime, followed by the import — which
 *     the production build happened to eliminate and the dev compiler did not,
 *     so `next build` passed while `next dev` served nothing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkStartup } = await import('./instrumentation-node');
    checkStartup();
  }
}
