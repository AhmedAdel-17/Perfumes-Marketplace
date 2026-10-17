import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteWait, type WaitPhase } from './route-wait';

/**
 * The page loader's promise to the visitor: a fast page never blinks a loader,
 * a slow one shows it long enough to be seen, and it always goes away.
 */
const TIMINGS = { appearAfter: 420, hold: 640, giveUp: 15_000 };

describe('the page loader never flashes', () => {
  let phases: WaitPhase[];
  let wait: RouteWait;

  beforeEach(() => {
    vi.useFakeTimers();
    phases = [];
    wait = new RouteWait(TIMINGS, {
      now: () => Date.now(),
      set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clear: (handle) => clearTimeout(handle),
    }, (phase) => phases.push(phase));
  });

  afterEach(() => {
    wait.dispose();
    vi.useRealTimers();
  });

  it('a page that arrives before the delay shows nothing at all', () => {
    wait.start();
    vi.advanceTimersByTime(TIMINGS.appearAfter - 1);
    wait.finish();
    vi.advanceTimersByTime(5_000);
    expect(phases).toEqual(['waiting', 'idle']);
    expect(phases).not.toContain('shown');
  });

  it('a slow page shows the flacon, keeps it the minimum time, then it sprays and lifts', () => {
    wait.start();
    vi.advanceTimersByTime(TIMINGS.appearAfter);
    expect(wait.current).toBe('shown');

    // Arrives 100ms after the flacon appeared: it stays until `hold` has passed…
    vi.advanceTimersByTime(100);
    wait.finish();
    vi.advanceTimersByTime(TIMINGS.hold - 100 - 1);
    expect(wait.current).toBe('shown');
    vi.advanceTimersByTime(1);
    // …then sprays for `hold`…
    expect(wait.current).toBe('done');
    vi.advanceTimersByTime(TIMINGS.hold);
    // …and is gone.
    expect(wait.current).toBe('idle');
    expect(phases).toEqual(['waiting', 'shown', 'done', 'idle']);
  });

  it('a page that kept it on screen long enough sprays at once', () => {
    wait.start();
    vi.advanceTimersByTime(TIMINGS.appearAfter + 2_000);
    wait.finish();
    vi.advanceTimersByTime(0);
    expect(wait.current).toBe('done');
  });

  it('a wait that never ends is abandoned rather than covering the page', () => {
    wait.start();
    vi.advanceTimersByTime(TIMINGS.giveUp);
    expect(wait.current).toBe('idle');
  });

  it('a second click while waiting does not start a second wait', () => {
    wait.start();
    wait.start();
    vi.advanceTimersByTime(TIMINGS.appearAfter);
    expect(phases).toEqual(['waiting', 'shown']);
  });
});
