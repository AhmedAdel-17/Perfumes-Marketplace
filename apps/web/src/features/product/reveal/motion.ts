import { easing, motion } from '@diyar/tokens';

/**
 * The house's motion tokens, as functions a frame loop can call.
 *
 * CSS reads `cubic-bezier(…)` itself; a WebGL bottle and a mist on a canvas
 * cannot, so the SAME curves from tokens.json are evaluated here — never
 * re-typed, so the reveal cannot drift from the rest of the site's motion.
 */
export type Ease = (t: number) => number;

/** A CSS cubic-bezier as a function of t in [0, 1] — the curve CSS draws (Newton on x, then y). */
function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  return (t) => {
    let u = t;
    for (let i = 0; i < 6; i++) {
      const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3 - t;
      const dx = 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
  };
}

const parse = (css: string | undefined): Ease => {
  const n = css?.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!n || n.length !== 4) return (t) => t;
  return bezier(n[0]!, n[1]!, n[2]!, n[3]!);
};

export const EASE = {
  out: parse(easing.out),
  inOut: parse(easing.inOut),
  entrance: parse(easing.entrance),
} as const;

/** Durations in milliseconds, from the tokens. */
export const MS = {
  quick: motion.quick ?? 240,
  base: motion.base ?? 420,
  slow: motion.slow ?? 640,
  ceremony: motion.ceremony ?? 1600,
} as const;

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Tweens run by the frame loop that owns them, so every motion shares one clock. */
export class Tweens {
  private readonly running = new Set<{ start: number; ms: number; ease: Ease; fn: (k: number) => void; done: () => void }>();

  constructor(private readonly still: boolean) {}

  run(ms: number, ease: Ease, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      this.running.add({ start: performance.now(), ms: this.still ? 1 : ms, ease, fn, done });
    });
  }

  step(now: number): void {
    for (const t of this.running) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.fn(t.ease(k));
      if (k >= 1) { this.running.delete(t); t.done(); }
    }
  }

  clear(): void { this.running.clear(); }
}
