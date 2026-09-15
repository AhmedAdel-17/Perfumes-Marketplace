/**
 * Every code the owner's report can show has words.
 *
 * `packages/i18n` cannot import the domain, so its lists are typed by their own
 * keys. This is the one place both are in scope, and it fails the moment a
 * reason, a source or a contribution input is added on one side only — before
 * an owner reads `seller_unresponsive` on a screen.
 */
import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_REASONS, ORDER_SOURCES, REFUSAL_REASONS, REJECTION_REASONS, RETURN_REASONS,
  Money, buildOwnerReport,
} from '@diyar/domain';
import {
  CONTRIBUTION_INPUT_AR, INPUT_STATUS_AR, ORDER_SOURCE_AR, REASON_CODE_AR,
} from '@diyar/i18n';

const sorted = (values: Iterable<string>) => [...values].sort();

describe('the owner report’s vocabulary', () => {
  it('names every reason code a sub-order can leave the funnel with — and no others', () => {
    const codes = [
      ...REJECTION_REASONS, ...CANCELLATION_REASONS, ...REFUSAL_REASONS, ...RETURN_REASONS,
    ];
    expect(sorted(Object.keys(REASON_CODE_AR))).toEqual(sorted(codes));
  });

  it('names every order source billing can charge on', () => {
    expect(sorted(Object.keys(ORDER_SOURCE_AR))).toEqual(sorted(ORDER_SOURCES));
  });

  it('names every contribution input the report actually produces, and every status', () => {
    // Read from a real report rather than a hand-written list, so an input added
    // to `buildOwnerReport` without words fails here.
    const report = buildOwnerReport({
      subOrders: [],
      asOf: new Date('2026-09-15T12:00:00Z'),
      platformRefunds: Money.zero(),
      ticketCount: 0,
      discounts: Money.zero(),
    });
    expect(sorted(Object.keys(CONTRIBUTION_INPUT_AR)))
      .toEqual(sorted(report.contributionInputs.map((i) => i.key)));
    expect(sorted(Object.keys(INPUT_STATUS_AR)))
      .toEqual(sorted(['recorded', 'zero_by_arrangement', 'count_only', 'not_recorded']));
  });

  it('every label is Arabic', () => {
    for (const words of [
      ...Object.values(REASON_CODE_AR), ...Object.values(ORDER_SOURCE_AR),
      ...Object.values(CONTRIBUTION_INPUT_AR), ...Object.values(INPUT_STATUS_AR),
    ]) {
      expect(words).toMatch(/[؀-ۿ]/);
    }
  });
});
