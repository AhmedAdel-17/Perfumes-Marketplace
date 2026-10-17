/**
 * The page loader's timing, as a state machine with no React and no DOM —
 * so the rule that matters most about it, NEVER A FLASH, is tested on a fake
 * clock rather than hoped for (route-wait.test.ts).
 *
 * PATTERN — State machine. idle → waiting → shown → done → idle:
 *
 *   start()   a wait begins. Nothing is drawn yet.
 *   ·         after `appearAfter` still waiting → shown.
 *   finish()  the page arrived. From `waiting`: straight back to idle, nothing
 *             was ever drawn. From `shown`: stay until the flacon has been on
 *             screen `hold`, then `done` (it sprays) for `hold`, then idle.
 *   ·         a wait still open after `giveUp` is abandoned, so a navigation
 *             that never reports back cannot cover the page for good.
 *
 * The clock and the timers are injected; the component passes the browser's.
 */
export type WaitPhase = 'idle' | 'waiting' | 'shown' | 'done';

export interface WaitClock {
  now(): number;
  set(fn: () => void, ms: number): number;
  clear(handle: number): void;
}

export interface WaitTimings {
  /** How long a wait must last before the flacon is drawn. */
  readonly appearAfter: number;
  /** The shortest time it is on screen, and the length of its spritz. */
  readonly hold: number;
  /** When an unfinished wait is abandoned. */
  readonly giveUp: number;
}

export class RouteWait {
  private phase: WaitPhase = 'idle';
  private shownAt = 0;
  private timers: number[] = [];

  constructor(
    private readonly timings: WaitTimings,
    private readonly clock: WaitClock,
    private readonly onChange: (phase: WaitPhase) => void,
  ) {}

  get current(): WaitPhase {
    return this.phase;
  }

  start(): void {
    if (this.phase !== 'idle') return;
    this.go('waiting');
    this.later(() => {
      if (this.phase !== 'waiting') return;
      this.shownAt = this.clock.now();
      this.go('shown');
    }, this.timings.appearAfter);
    this.later(() => this.reset(), this.timings.giveUp);
  }

  finish(): void {
    if (this.phase === 'waiting') {
      this.reset();
      return;
    }
    if (this.phase !== 'shown') return;
    this.clearAll();
    const remaining = Math.max(0, this.timings.hold - (this.clock.now() - this.shownAt));
    this.later(() => {
      this.go('done');
      this.later(() => this.go('idle'), this.timings.hold);
    }, remaining);
  }

  dispose(): void {
    this.clearAll();
  }

  private reset(): void {
    this.clearAll();
    this.go('idle');
  }

  private go(next: WaitPhase): void {
    if (this.phase === next) return;
    this.phase = next;
    this.onChange(next);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(this.clock.set(fn, ms));
  }

  private clearAll(): void {
    this.timers.forEach((handle) => this.clock.clear(handle));
    this.timers = [];
  }
}
