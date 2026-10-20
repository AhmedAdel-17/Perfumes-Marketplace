import { EASE, MS } from '@/features/motion/motion';

/**
 * The scent map's sky, turning (La Carte olfactive — founder 19 Oct 2026;
 * design-reference/experiences/03-carte-olfactive.html). React draws the sky;
 * this turns it.
 *
 * Pattern — an IMPERATIVE CONTROLLER behind a presentational component, as the
 * reveal's stage and the dial are: the wheel, the distant stars and every word
 * that must stay level as the wheel turns move each frame, and React state
 * would re-render the whole sky sixty times a second.
 *
 * Dragged, the sky turns under the hand and, let go, carries on and settles —
 * a heavy wheel, never a spring. Left alone it drifts, very slowly, as a night
 * sky does; it stops for a visitor who asked for less motion, while the page is
 * out of sight, and whenever a hand is over it. A press that did not turn the
 * sky is a choice, and is handed back to the page.
 */
export interface SkyParts {
  readonly svg: SVGSVGElement;
  readonly wheel: SVGGElement;
  readonly field: SVGGElement;
  /** Everything that must stay level as the wheel turns: words and bottles. */
  readonly uprights: ReadonlyArray<{ readonly el: SVGGElement; readonly x: number; readonly y: number }>;
  /** Each note's words, set outward from its star on whichever side faces away from the centre. */
  readonly labels: ReadonlyArray<{ readonly el: SVGGElement; readonly a: number }>;
}

/** The sky's own drift, radians a second: one turn in about six minutes. */
const DRIFT = 0.018;
/** How long a sky must be left alone before it drifts again. */
const REST_MS = 2500;

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class SkyController {
  private angle = -0.18;
  private omega = 0;
  private tween: { from: number; to: number; start: number; ms: number } | null = null;
  private drag: { id: number; a: number; t: number; moved: number; target: Element | null } | null = null;
  private pointer = { x: 0, y: 0 };
  private lastInput = 0;
  private hovering = false;
  private visible = true;
  private frame = 0;
  private prev = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly parts: SkyParts,
    private readonly still: boolean,
    /** A press that did not turn the sky: the element under it, if any. */
    private readonly onPress: (target: Element | null) => void,
  ) {
    this.listen();
    this.place();
    this.wake();
  }

  /** Bring an angle round to the top, the nearest way round. */
  spinTo(target: number): void {
    const goal = this.angle + wrapPi(target - this.angle);
    this.tween = { from: this.angle, to: goal, start: performance.now(), ms: this.still ? 1 : MS.ceremony * 0.7 };
    this.omega = 0;
    this.wake();
  }

  /** One sector either way, from the keyboard. */
  step(by: number): void { this.spinTo(this.angle + by); }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const off of this.cleanup) off();
  }

  private local(event: PointerEvent): { x: number; y: number } {
    const r = this.parts.svg.getBoundingClientRect();
    return { x: ((event.clientX - r.left) / r.width - 0.5) * 880, y: ((event.clientY - r.top) / r.height - 0.5) * 880 };
  }

  private listen(): void {
    const svg = this.parts.svg;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const p = this.local(event);
      this.drag = { id: event.pointerId, a: Math.atan2(p.y, p.x), t: performance.now(), moved: 0, target: (event.target as Element).closest('[data-kind]') };
      svg.setPointerCapture(event.pointerId);
      svg.dataset.grabbing = '';
      this.omega = 0;
      this.tween = null;
      this.wake();
    };
    const move = (event: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      this.pointer = { x: (event.clientX - r.left) / r.width - 0.5, y: (event.clientY - r.top) / r.height - 0.5 };
      this.lastInput = performance.now();
      if (!this.drag || event.pointerId !== this.drag.id) { this.wake(); return; }
      const p = this.local(event), a = Math.atan2(p.y, p.x), now = performance.now();
      const da = wrapPi(a - this.drag.a), dt = Math.max(1, now - this.drag.t) / 1000;
      this.angle += da;
      this.omega = this.omega * 0.6 + (da / dt) * 0.4;
      this.drag.moved += Math.abs(da) * Math.hypot(p.x, p.y);
      this.drag.a = a;
      this.drag.t = now;
      this.wake();
    };
    const release = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      delete svg.dataset.grabbing;
      if (this.drag.moved < 8) { this.omega = 0; this.onPress(this.drag.target); }
      if (this.still) this.omega = 0;
      this.drag = null;
      this.wake();
    };
    const enter = () => { this.hovering = true; };
    const leave = () => { this.hovering = false; this.wake(); };
    // While a finger turns the sky, the page does not scroll under it.
    const hold = (event: TouchEvent) => { if (this.drag) event.preventDefault(); };
    const seen = new IntersectionObserver(([entry]) => {
      this.visible = !!entry?.isIntersecting;
      if (this.visible) this.wake();
    });
    seen.observe(svg);
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.addEventListener('pointerenter', enter);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('touchmove', hold, { passive: false });
    this.cleanup.push(() => {
      seen.disconnect();
      svg.removeEventListener('pointerdown', down);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', release);
      svg.removeEventListener('pointercancel', release);
      svg.removeEventListener('pointerenter', enter);
      svg.removeEventListener('pointerleave', leave);
      svg.removeEventListener('touchmove', hold);
    });
  }

  private wake(): void {
    if (!this.frame) { this.prev = 0; this.frame = requestAnimationFrame(this.tick); }
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.05, (now - (this.prev || now)) / 1000);
    this.prev = now;
    let moving = false;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.start) / this.tween.ms);
      this.angle = this.tween.from + (this.tween.to - this.tween.from) * EASE.inOut(k);
      if (k >= 1) this.tween = null;
      moving = true;
    } else if (!this.drag && !this.still) {
      // Thrown, it carries on and settles; left alone, it drifts.
      this.angle += this.omega * dt;
      this.omega *= Math.exp(-dt * 1.6);
      if (Math.abs(this.omega) < 0.02) this.omega = 0; else moving = true;
      if (!this.hovering && now - this.lastInput > REST_MS) { this.angle += DRIFT * dt; moving = true; }
      else if (!this.hovering) moving = true;
    }
    if (this.drag) moving = true;
    this.place();
    this.frame = moving && this.visible && !document.hidden ? requestAnimationFrame(this.tick) : 0;
  };

  private place(): void {
    const d = (this.angle * 180) / Math.PI;
    this.parts.wheel.setAttribute('transform', `rotate(${d.toFixed(3)})`);
    // The far stars turn slower than the wheel and lean away from the hand, for depth.
    const px = this.still ? 0 : this.pointer.x * -10, py = this.still ? 0 : this.pointer.y * -10;
    this.parts.field.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${(d * 0.35).toFixed(3)})`);
    for (const u of this.parts.uprights) {
      u.el.setAttribute('transform', `translate(${u.x.toFixed(2)} ${u.y.toFixed(2)}) rotate(${(-d).toFixed(3)})`);
    }
    for (const label of this.parts.labels) {
      const sa = label.a + this.angle;
      label.el.dataset.side = Math.cos(sa) >= 0 ? 'right' : 'left';
      label.el.setAttribute('transform', `translate(${(Math.cos(sa) * 14).toFixed(1)} ${(Math.sin(sa) * 14 + 4).toFixed(1)})`);
    }
  }
}
