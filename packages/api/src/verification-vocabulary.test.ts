/**
 * The operators' labels name every verification control the database enforces,
 * and no others.
 *
 * Migration 0001's `sellers_verification_gate` counts the `verification_control`
 * enum, and the applications board labels each control from this map. The
 * schema and the copy cannot import each other; this is where both are in
 * scope, so a ninth control fails here instead of showing an operator a blank.
 *
 * (Until 17 Oct 2026 the HOME page also listed the eight controls to customers,
 * and this test held that list to the enum too. The founder moved everything
 * house-facing off the customer pages; the list went with it.)
 */
import { describe, expect, it } from 'vitest';
import { schema } from '@diyar/db';
import { VERIFICATION_CONTROL_AR } from '@diyar/i18n';

const sorted = (values: Iterable<string>) => [...values].sort();

describe('the verification vocabulary', () => {
  const controls = schema.verificationControl.enumValues;

  it('the operators’ labels cover the same controls', () => {
    expect(sorted(Object.keys(VERIFICATION_CONTROL_AR))).toEqual(sorted(controls));
  });
});
