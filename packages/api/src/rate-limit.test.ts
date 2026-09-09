import { beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMITS, consume, rateLimitMessage, resetRateLimits, type RateLimitName,
} from './rate-limit';

const NOW = Date.parse('2026-09-09T12:00:00Z');

beforeEach(() => resetRateLimits());

describe('counting attempts', () => {
  it('allows up to the limit and refuses the one after', () => {
    const rule = RATE_LIMITS.otp;
    for (let i = 0; i < rule.limit; i += 1) {
      expect(consume('otp', '01001234567', NOW).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(consume('otp', '01001234567', NOW).allowed).toBe(false);
  });

  it('counts an ATTEMPT, not a success', () => {
    /*
     * The one-time-code path is why. Counting only successful sends would let
     * somebody hammer a number that does not belong to a house for free — and
     * that path deliberately returns the same answer whether or not the number
     * is a seller's, so "success" is not even observable from outside.
     */
    for (let i = 0; i < RATE_LIMITS.otp.limit; i += 1) consume('otp', 'x', NOW);
    expect(consume('otp', 'x', NOW).allowed).toBe(false);
  });

  it('keeps one caller’s limit off another’s', () => {
    for (let i = 0; i < RATE_LIMITS.otp.limit + 3; i += 1) consume('otp', 'noisy', NOW);
    expect(consume('otp', 'quiet', NOW).allowed).toBe(true);
  });

  it('keeps one rule’s counter off another’s', () => {
    // A customer who placed ten orders has not used up their support tickets.
    for (let i = 0; i < RATE_LIMITS.order.limit + 3; i += 1) consume('order', 'same', NOW);
    expect(consume('ticket', 'same', NOW).allowed).toBe(true);
  });

  it('forgets the window once it has passed', () => {
    for (let i = 0; i < RATE_LIMITS.otp.limit + 1; i += 1) consume('otp', 'later', NOW);
    expect(consume('otp', 'later', NOW).allowed).toBe(false);

    const after = NOW + RATE_LIMITS.otp.windowMs + 1;
    expect(consume('otp', 'later', after).allowed).toBe(true);
  });

  it('says how long to wait, in seconds that shrink', () => {
    for (let i = 0; i < RATE_LIMITS.otp.limit + 1; i += 1) consume('otp', 'wait', NOW);

    const immediately = consume('otp', 'wait', NOW).retryAfterSeconds;
    const halfway = consume('otp', 'wait', NOW + RATE_LIMITS.otp.windowMs / 2).retryAfterSeconds;

    expect(immediately).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(immediately);
  });
});

describe('the rules themselves', () => {
  it('has a positive limit and a real window for every rule', () => {
    // A rule with a limit of zero locks everybody out; one with a window of
    // zero never limits anybody. Both are a typo away.
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0);
      expect(rule.windowMs, name).toBeGreaterThanOrEqual(60_000);
    }
  });

  it('is tightest on the rule that costs money', () => {
    /*
     * Every one-time code is an SMS somebody pays for and a phone that buzzes.
     * If any other rule is ever tightened past it, the ordering has been lost
     * and this says so.
     */
    const perHour = (name: RateLimitName) =>
      RATE_LIMITS[name].limit / (RATE_LIMITS[name].windowMs / 3_600_000);

    for (const name of ['order', 'ticket', 'aftercare'] as const) {
      expect(perHour('otp'), `otp vs ${name}`).toBeLessThanOrEqual(perHour(name));
    }
  });
});

describe('what a limited caller is told', () => {
  it('says WHEN, not just no', () => {
    // "Try later" is the sentence that turns a rate limit into a support ticket.
    expect(rateLimitMessage(30)).toContain('دقيقة');
    expect(rateLimitMessage(20 * 60)).toContain('20');
    expect(rateLimitMessage(3 * 3_600)).toContain('ساعة');
  });
});
