/**
 * The payout kill switch.
 *
 * PATTERN: a release toggle that FAILS CLOSED (ENGINEERING_PRINCIPLES §4). The
 * usual feature flag defaults to off and is turned on to ship something. This
 * one defaults to off only where it is dangerous — production — and stays on
 * everywhere else, because the thing being guarded is not an unfinished feature
 * but a finished one that is WRONG.
 *
 * WHAT IS WRONG WITH IT. `platform.runPayout` pays every eligible sub-order on
 * every run. Nothing records that a sub-order has already been paid;
 * `payout_lines_unique` only stops two lines inside the SAME payout. Run it
 * twice and a house is paid twice; run it weekly and a house is paid every week
 * for one sale. That is defect C1 in
 * `docs/architecture/08-order-payment-payout-flows.md` §1.1, and the fix is the
 * ledger in P3.1.2/P3.1.3, not a patch here.
 *
 * WHY A SWITCH RATHER THAN DELETING THE PROCEDURE. It is the only executable
 * description of what a statement contains, five API tests exercise it, and
 * `SettlementService` underneath it is correct — the arithmetic is not the bug,
 * the absence of a paid-marker is. Deleting it would cost the tests and the
 * shape; leaving it reachable in production would leave a console with a
 * working "run payout" button in front of real houses.
 *
 * WHY THE DEFAULT IS COMPUTED, NOT WRITTEN DOWN. A flag that must be SET to be
 * safe is a flag that is unsafe on the day someone forgets, and the day someone
 * forgets is the day a new environment is created — the only day this matters.
 * So an unset variable means safe, and the only way to be unsafe is to say so
 * out loud.
 *
 * TURNING IT ON IS NOT AN ENGINEERING DECISION. DR-03 records that pilot money
 * is handled by hand, two people, no software payout, until the ledger exists
 * (P3.1.5 retires this path entirely). Setting `PAYOUTS_ENABLED=true` against
 * real houses before then contradicts a founders' decision, and this file
 * cannot stop that — it can only make it deliberate.
 */

/**
 * The refusal, in Arabic, naming the reason rather than the rule.
 *
 * Exported so the procedure and any control that offers a payout show the SAME
 * sentence. A screen that says "not allowed" while the server says "the ledger
 * is not finished, pay by hand" teaches an operator that the product is
 * arbitrary, and an operator who believes that starts working around it.
 */
export const PAYOUTS_DISABLED_MESSAGE =
  'صرف المستحقات عبر النظام معطّل في بيئة التشغيل. حتى يكتمل دفتر الحسابات تُصرف '
  + 'المستحقات يدويًا بموافقة شخصين، لأن التشغيل الحالي قد يكرّر صرف نفس الطلب.';

/**
 * Whether a software payout may run.
 *
 * Takes both values rather than reading `process.env`, for the reason
 * `assertProductionSafe` does: `packages/api` reads no environment anywhere, so
 * the rule is decided at the composition root and provable in a unit test
 * instead of a deployment.
 *
 * `flag` wins when it says something this function recognises, so an operator
 * can switch it either way in any environment. Anything it does not
 * recognise — unset, empty, `1`, `yes`, a typo — is treated as SILENCE rather
 * than as consent, and silence falls back to the environment. `1` meaning off
 * in production is the intended outcome of that: a value nobody has agreed the
 * meaning of should never be what opens the money path.
 */
export function payoutsAreEnabled(
  flag: string | undefined,
  environment: string | undefined,
): boolean {
  const said = flag?.trim().toLowerCase();
  if (said === 'true') return true;
  if (said === 'false') return false;
  return environment !== 'production';
}
