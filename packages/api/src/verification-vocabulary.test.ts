/**
 * The home page names every verification control the database enforces, and
 * no others.
 *
 * The public page tells a customer "every house passes these eight" and stamps
 * each perfume "8 / 8". Migration 0001's `sellers_verification_gate` is what
 * makes that true, and it counts the `verification_control` enum. The schema
 * and the copy cannot import each other; this is where both are in scope, so a
 * ninth control fails here instead of quietly making the public promise short
 * by one.
 */
import { describe, expect, it } from 'vitest';
import { schema } from '@diyar/db';
import { HOME, VERIFICATION_CONTROL_AR } from '@diyar/i18n';

const sorted = (values: Iterable<string>) => [...values].sort();

describe('the verification vocabulary', () => {
  const controls = schema.verificationControl.enumValues;

  it('the public page describes every control, in both languages, and no others', () => {
    expect(sorted(Object.keys(HOME.ar.checks))).toEqual(sorted(controls));
    expect(sorted(Object.keys(HOME.en.checks))).toEqual(sorted(controls));
  });

  it('lists them in the order the checklist does', () => {
    expect(Object.keys(HOME.ar.checks)).toEqual([...controls]);
  });

  it('the operators’ labels cover the same controls', () => {
    expect(sorted(Object.keys(VERIFICATION_CONTROL_AR))).toEqual(sorted(controls));
  });
});
