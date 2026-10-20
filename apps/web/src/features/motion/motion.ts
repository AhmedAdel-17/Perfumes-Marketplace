import { easing, motion } from '@diyar/tokens';

/**
 * The house's motion tokens, as functions a frame loop can call.
 *
 * CSS reads `cubic-bezier(…)` itself; a WebGL bottle and a mist on a canvas
 * cannot, so the SAME curves from tokens.json are evaluated here — never
 * re-typed, so no experience can drift from the rest of the site's motion.
 *
 * Shared by every experience that moves things itself (20 Oct 2026): the
 * reveal's stage, the drop that carries a perfume to the bag, the loupe, the
 * day-on-the-skin dial and the scent map. It lived in the reveal's folder
 * while the reveal was its only user.
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
  mist: motion.mist ?? 2400,
} as const;

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));

/**
 * Whether the visitor has asked for less motion. Read when an effect starts,
 * not once at load, so changing the setting takes hold without a reload.
 */
export const prefersStill = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Whether the main pointer can hover — a mouse or a pen, not a finger. */
export const canHover = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Tweens run by the frame loop that owns them, so every motion shares one clock. */
export class Tweens {
  private readonly running = new Set<{
    start: number; ms: number; ease: Ease; fn: (k: number) => void; done: () => void; interruptible: boolean;
  }>();

  constructor(private readonly still: boolean) {}

  /**
   * `interruptible`: `interrupt()` may end it where it is. For a motion the
   * visitor can cut short — the reveal on its way into a page, which a press
   * sends straight there from wherever it has got to.
   */
  run(ms: number, ease: Ease, fn: (k: number) => void, interruptible = false): Promise<void> {
    return new Promise((done) => {
      this.running.add({ start: performance.now(), ms: this.still ? 1 : ms, ease, fn, done, interruptible });
    });
  }

  step(now: number): void {
    for (const t of this.running) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.fn(t.ease(k));
      if (k >= 1) { this.running.delete(t); t.done(); }
    }
  }

  /** Ends every interruptible tween where it last drew; what awaited it goes on from there. */
  interrupt(): void {
    for (const t of this.running) if (t.interruptible) { this.running.delete(t); t.done(); }
  }

  /** Drops every tween; nothing that awaited one goes on. */
  clear(): void { this.running.clear(); }
}
