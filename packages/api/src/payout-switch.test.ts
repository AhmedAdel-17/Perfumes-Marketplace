import { describe, expect, it } from 'vitest';
import { PAYOUTS_DISABLED_MESSAGE, payoutsAreEnabled } from './payout-switch';

/**
 * The switch's rule, proved without a deployment.
 *
 * The acceptance criterion for P0.1.3 is about an environment nobody runs
 * tests in, so the rule is a pure function and the environment is an argument.
 * The case that actually protects a house is the first one: nothing set, in
 * production.
 */
describe('the payout kill switch decides from the environment', () => {
  it('is OFF in production when nothing is set', () => {
    // The whole point. A flag that must be set to be safe is unsafe on the day
    // someone forgets, and that day is the day a new environment is created.
    expect(payoutsAreEnabled(undefined, 'production')).toBe(false);
  });

  it('is on in development and in test when nothing is set', () => {
    expect(payoutsAreEnabled(undefined, 'development')).toBe(true);
    expect(payoutsAreEnabled(undefined, 'test')).toBe(true);
    expect(payoutsAreEnabled(undefined, undefined)).toBe(true);
  });

  it('lets an explicit value win in either direction', () => {
    expect(payoutsAreEnabled('true', 'production')).toBe(true);
    expect(payoutsAreEnabled('false', 'development')).toBe(false);
  });

  it('reads a value the way a shell would hand it over', () => {
    // Quoting and case are how an environment variable actually arrives.
    expect(payoutsAreEnabled(' TRUE ', 'production')).toBe(true);
    expect(payoutsAreEnabled('False', 'development')).toBe(false);
  });

  it('treats a value it does not recognise as silence, not as consent', () => {
    // `1` and `yes` mean yes to a person and nothing to this function. In
    // production that reads as off, which is the intended outcome: a value
    // whose meaning nobody agreed should never be what opens the money path.
    for (const said of ['1', 'yes', 'on', '', '   ', 'ture']) {
      expect(payoutsAreEnabled(said, 'production'), `"${said}" opened production`).toBe(false);
      expect(payoutsAreEnabled(said, 'development')).toBe(true);
    }
  });

  it('refuses in Arabic, naming the reason and the alternative', () => {
    // CLAUDE.md §17: errors reach the user in Arabic. An operator who is told
    // only "forbidden" opens a support ticket; one who is told the ledger is
    // unfinished and the money is paid by hand knows what to do instead.
    expect(PAYOUTS_DISABLED_MESSAGE).toMatch(/[؀-ۿ]/);
    expect(PAYOUTS_DISABLED_MESSAGE).toMatch(/دفتر الحسابات/);
    expect(PAYOUTS_DISABLED_MESSAGE).toMatch(/يدويًا/);
    expect(PAYOUTS_DISABLED_MESSAGE).not.toMatch(/[A-Za-z]{3}/);
  });
});
