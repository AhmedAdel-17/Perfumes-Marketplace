/**
 * Port: Clock.
 *
 * Pattern — Dependency Inversion (ENGINEERING_PRINCIPLES §2, "the clock rule").
 *
 * Domain code must NEVER call `new Date()` or `Date.now()`. SLA clocks, reserve
 * periods, attribution windows and payout schedules are all time-dependent money
 * logic; they have to be testable at any instant, which means time is injected.
 */
export interface Clock {
  now(): Date;
}

/** Production implementation. The only place `new Date()` is allowed. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test double. Deterministic and movable. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 3_600_000);
  }
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
