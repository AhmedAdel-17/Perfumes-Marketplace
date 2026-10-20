import {
  NOTE_TIERS, DIAL_HOURS, TIER_WEIGHT, phaseAt, presence, sillageAt, strengthAt,
  type DayPhase, type NoteTier, type SkinDay,
} from '@diyar/domain';
import { MS } from '@/features/motion/motion';
import { Vapour } from '@/features/motion/vapour';
import { polar, R, RING } from './dial-geometry';

/**
 * The day-on-the-skin dial's movement (La Durée — founder 19 Oct 2026;
 * design-reference/experiences/02-la-duree.html). The dial is drawn by React;
 * this winds it.
 *
 * Pattern — an IMPERATIVE CONTROLLER behind a presentational component, as the
 * reveal's stage is (ENGINEERING_PRINCIPLES §4): three hundred and sixty ring
 * segments, a hand, beads and a mist change every frame while the hand moves,
 * and React state would re-render the whole figure each time. The controller
 * touches an attribute only when its value changes, and stops its frame loop
 * the moment nothing is moving — at rest the dial costs nothing.
 *
 * The visitor turns it: dragging the hand round the face, the arrow keys (it
 * is a slider to assistive technology), or one press of "spray", which plays
 * the day from the first spritz at a steady pace. It never plays by itself.
 * The hand has weight — it follows the hand that turns it, it does not jump —
 * except for a visitor who asked for less motion, for whom it simply goes
 * where it is sent and no mist rises.
 *
 * Every shape is the domain's `skinDay` of the declared bands; nothing here
 * decides what a band means.
 */

/** The steady pace of a played day: hours per second, so a long band plays in about eight. */
const PLAY_RATE = 1.5;
const SEGMENTS = 120;
const NS = 'http://www.w3.org/2000/svg';

export interface DialParts {
  readonly face: HTMLElement;
  readonly segments: SVGGElement;
  readonly engraving: SVGGElement;
  readonly needle: SVGGElement;
  readonly dots: Readonly<Record<NoteTier, SVGCircleElement>>;
  readonly beads: ReadonlyArray<{ readonly el: SVGGElement; readonly tier: NoteTier; readonly hour: number }>;
  readonly aura: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly time: HTMLElement;
}

export interface DialHooks {
  /** The part of the day the hand is in changed — the words beside the dial follow. */
  readonly onPhase: (phase: DayPhase) => void;
  /** The visitor turned the dial for the first time on this page. */
  readonly onFirstTurn: () => void;
  /** What assistive technology reads as the hand's position. */
  readonly valueText: (hours: number, minutes: number, phase: DayPhase) => string;
}

interface Segment { readonly path: SVGPathElement; readonly tier: NoteTier; readonly hour: number; key: string }
interface BeadState { readonly el: SVGGElement; readonly tier: NoteTier; readonly hour: number; state: '' | 'wait' | 'lit' | 'gone' }

const arc = (r: number, h0: number, h1: number): string => {
  const [x0, y0] = polar(r, h0), [x1, y1] = polar(r, h1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export class DialController {
  private readonly segments: Segment[] = [];
  private readonly beads: BeadState[];
  private readonly air: Vapour;
  private goal = 0;
  private shown = 0;
  private lastShown = 0;
  private playing: { from: number; start: number } | null = null;
  private turned = false;
  private frame = 0;
  private prev = 0;
  private phase: DayPhase | null = null;
  private quarter = -1;
  private readonly prevPresence: Record<NoteTier, number> = { top: 1, heart: 0, base: 0 };
  private drag: { id: number; hour: number } | null = null;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly parts: DialParts,
    private readonly day: SkinDay,
    private readonly hooks: DialHooks,
    private readonly still: boolean,
  ) {
    this.air = new Vapour(parts.canvas, { drag: [0.5, 0.8], sway: 10, limit: 360 });
    this.beads = parts.beads.map((b) => ({ ...b, state: '' }));
    this.buildSegments();
    this.listen();
    this.draw(0, 0);
  }

  /** The guilloché: waved rings each a little out of phase, as a rose engine cuts a dial — engraved in on arrival. */
  engrave(): void {
    const g = this.parts.engraving;
    if (g.childElementCount) return;
    const rings = 18, points = 360;
    for (let i = 0; i < rings; i++) {
      const base = R.gIn + 3 + (i * (R.gOut - R.gIn - 6)) / (rings - 1);
      let d = '';
      for (let s = 0; s <= points; s++) {
        const a = (s / points) * Math.PI * 2;
        const r = base + 2.4 * Math.sin(a * 36 + i * 0.95);
        d += `${s ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      }
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `${d}Z`);
      path.setAttribute('class', this.still ? 'dial-engraving' : 'dial-engraving dial-engraving-in');
      path.style.setProperty('--i', String(i));
      g.append(path);
      if (!this.still) path.style.setProperty('--len', path.getTotalLength().toFixed(0));
    }
  }

  /** "Spray": the day from the first spritz, at a steady pace. */
  play(): void {
    this.first();
    // The hand sweeps back to the spray with its usual weight, and the day
    // runs on from there; it never jumps.
    this.playing = { from: 0, start: performance.now() };
    this.goal = 0;
    if (!this.still) this.spritz();
    this.wake();
  }

  /**
   * A key, as the slider takes it: a quarter of an hour with the arrows (the
   * reading direction decides which arrow is later), an hour with Page Up and
   * Down, the spray and the end of the day with Home and End. True when the
   * key was the dial's. Public so a key pressed before this controller had
   * arrived can be handed on (SkinDial).
   */
  press(key: string): boolean {
    const rtl = getComputedStyle(this.parts.face).direction === 'rtl';
    const steps: Record<string, number> = {
      ArrowUp: 0.25, ArrowDown: -0.25,
      ArrowRight: rtl ? -0.25 : 0.25, ArrowLeft: rtl ? 0.25 : -0.25,
      PageUp: 1, PageDown: -1,
    };
    let to: number | null = null;
    if (key in steps) to = this.goal + steps[key]!;
    if (key === 'Home') to = 0;
    if (key === 'End') to = this.day.span;
    if (to === null) return false;
    this.first();
    this.playing = null;
    this.send(to);
    return true;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const off of this.cleanup) off();
    this.air.clear();
    // The segments are this controller's own; a remount (React runs effects
    // twice in development) must not find a stale set under its new one.
    this.parts.segments.replaceChildren();
  }

  // ------------------------------------------------------------------ input

  private listen(): void {
    const face = this.parts.face;
    const hourAt = (event: PointerEvent): number => {
      const r = face.getBoundingClientRect();
      const a = Math.atan2(event.clientY - (r.top + r.height / 2), event.clientX - (r.left + r.width / 2));
      return (((a + Math.PI / 2) / (Math.PI * 2)) * DIAL_HOURS + DIAL_HOURS) % DIAL_HOURS;
    };
    // Round the face is continuous; past the twelve it does not leap back to
    // nought — it stops there, as the hand of a day would.
    const nearest = (h: number, to: number) => {
      const options = [h - DIAL_HOURS, h, h + DIAL_HOURS];
      return options.reduce((best, x) => (Math.abs(x - to) < Math.abs(best - to) ? x : best));
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType !== 'mouse') {
        // A finger on the middle of the face is a finger scrolling the page;
        // only one laid on the rings turns the hand.
        const r = face.getBoundingClientRect();
        const reach = Math.hypot(event.clientX - (r.left + r.width / 2), event.clientY - (r.top + r.height / 2)) / (r.width / 2);
        if (reach < (R.base - 34) / 320 || reach > 1) return;
      }
      this.first();
      this.playing = null;
      face.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, hour: this.goal };
      this.send(nearest(hourAt(event), this.goal));
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.send(nearest(hourAt(event), this.goal));
    };
    const up = (event: PointerEvent) => {
      if (this.drag?.id === event.pointerId) this.drag = null;
    };
    const key = (event: KeyboardEvent) => { if (this.press(event.key)) event.preventDefault(); };
    // While a finger turns the hand, the page does not scroll under it.
    const hold = (event: TouchEvent) => { if (this.drag) event.preventDefault(); };
    face.addEventListener('pointerdown', down);
    face.addEventListener('pointermove', move);
    face.addEventListener('pointerup', up);
    face.addEventListener('pointercancel', up);
    face.addEventListener('keydown', key);
    face.addEventListener('touchmove', hold, { passive: false });
    this.cleanup.push(() => {
      face.removeEventListener('pointerdown', down);
      face.removeEventListener('pointermove', move);
      face.removeEventListener('pointerup', up);
      face.removeEventListener('pointercancel', up);
      face.removeEventListener('keydown', key);
      face.removeEventListener('touchmove', hold);
    });
  }

  private first(): void {
    if (this.turned) return;
    this.turned = true;
    this.hooks.onFirstTurn();
  }

  private send(hour: number): void {
    this.goal = Math.min(DIAL_HOURS, Math.max(0, hour));
    if (this.still) this.shown = this.goal;
    this.wake();
  }

  // ------------------------------------------------------------------ the frame

  private wake(): void {
    if (!this.frame) { this.prev = 0; this.frame = requestAnimationFrame(this.tick); }
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.05, (now - (this.prev || now)) / 1000);
    this.prev = now;
    if (this.playing) {
      const end = this.day.span + 0.6;
      this.goal = Math.min(end, this.playing.from + ((now - this.playing.start) / 1000) * PLAY_RATE);
      if (this.goal >= end) this.playing = null;
      if (this.still) this.shown = this.goal;
    }
    // A weighted hand: it follows, it does not jump.
    if (!this.still) this.shown += (this.goal - this.shown) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(this.goal - this.shown) < 0.0005) this.shown = this.goal;
    this.draw(this.shown, dt);
    const misting = this.air.step(dt, now / 1000);
    this.lastShown = this.shown;
    const moving = this.playing !== null || this.shown !== this.goal || this.drag !== null;
    this.frame = moving || misting ? requestAnimationFrame(this.tick) : 0;
  };

  private buildSegments(): void {
    // Each tier's recording: a short arc every six minutes, thick and dark where
    // the tier is strong — what has passed inked, what is to come a ghost.
    for (const tier of NOTE_TIERS) {
      for (let i = 0; i < SEGMENTS; i++) {
        const h0 = (i / SEGMENTS) * DIAL_HOURS, h1 = ((i + 1) / SEGMENTS) * DIAL_HOURS;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', arc(RING[tier], h0, h1 + 0.012));
        path.setAttribute('class', `dial-seg dial-${tier}`);
        path.setAttribute('opacity', '0');
        this.parts.segments.append(path);
        this.segments.push({ path, tier, hour: (h0 + h1) / 2, key: '' });
      }
    }
  }

  private draw(t: number, dt: number): void {
    const day = this.day;
    const forward = t > this.lastShown + 1e-5;
    for (const seg of this.segments) {
      const e = presence(day.tiers[seg.tier], seg.hour) * TIER_WEIGHT[seg.tier];
      const done = seg.hour <= t;
      const opacity = e < 0.012 ? 0 : done ? 0.3 + 0.7 * e : 0.1 + 0.08 * e;
      const width = done ? 2 + 10 * e : 2 + 3.5 * e;
      const key = `${opacity.toFixed(2)}|${width.toFixed(1)}`;
      if (key !== seg.key) {
        seg.key = key;
        seg.path.setAttribute('opacity', opacity.toFixed(2));
        seg.path.setAttribute('stroke-width', width.toFixed(1));
      }
    }
    this.parts.needle.setAttribute('transform', `rotate(${((t / DIAL_HOURS) * 360).toFixed(2)})`);
    const now = Object.fromEntries(NOTE_TIERS.map((tier) => [tier, presence(day.tiers[tier], t)])) as Record<NoteTier, number>;
    for (const tier of NOTE_TIERS) {
      this.parts.dots[tier].setAttribute('r', (2.5 + 7 * now[tier] * TIER_WEIGHT[tier]).toFixed(2));
    }

    // The notes light as the hand reaches them and evaporate when their tier is spent.
    for (const bead of this.beads) {
      const state = t < bead.hour - 0.02 ? 'wait' : now[bead.tier] > 0.14 ? 'lit' : 'gone';
      if (state === bead.state) {
        if (state === 'lit' && !this.still && Math.random() < dt * 2.2 * now[bead.tier]) this.mist(bead.tier, RING[bead.tier], bead.hour, 1, false);
        continue;
      }
      if (state === 'gone' && bead.state === 'lit' && forward) this.mist(bead.tier, RING[bead.tier], bead.hour, 22, true);
      bead.state = state;
      bead.el.toggleAttribute('data-lit', state === 'lit');
      bead.el.toggleAttribute('data-gone', state === 'gone');
    }
    // A fading tier gives itself up into the air where the hand crosses it.
    for (const tier of NOTE_TIERS) {
      const fall = this.prevPresence[tier] - now[tier];
      if (fall > 0.002 && forward) this.mist(tier, RING[tier], t, Math.min(6, Math.ceil(fall * 120)), false);
      this.prevPresence[tier] = now[tier];
    }

    // The sillage: how far the perfume reaches now.
    const strength = strengthAt(day, t);
    this.parts.aura.style.opacity = (0.1 + 0.45 * strength).toFixed(3);
    this.parts.aura.style.transform = `scale(${sillageAt(day, t).toFixed(3)})`;

    const hours = Math.floor(t), minutes = Math.floor((t - hours) * 60);
    this.parts.time.textContent = `${hours}:${String(minutes).padStart(2, '0')}`;
    const phase = phaseAt(day, t);
    if (phase !== this.phase) { this.phase = phase; this.hooks.onPhase(phase); }
    // Spoken to the quarter hour, the value and its words agreeing.
    const quarter = Math.round(t * 4);
    if (quarter !== this.quarter) {
      this.quarter = quarter;
      const q = quarter / 4, qh = Math.floor(q);
      this.parts.face.setAttribute('aria-valuenow', q.toFixed(2));
      this.parts.face.setAttribute('aria-valuetext', this.hooks.valueText(qh, Math.round((q - qh) * 60), phase));
    }
  }

  // ------------------------------------------------------------------ the air

  /** The opening spritz of a played day, from the middle of the face. */
  private spritz(): void {
    for (let i = 0; i < 18; i++) this.mist('top', R.sub * 0.6, (i / 18) * DIAL_HOURS, 1, true);
  }

  private mist(tier: NoteTier, radius: number, hour: number, count: number, strong: boolean): void {
    if (this.still) return;
    const colour = getComputedStyle(this.parts.face).getPropertyValue(`--dial-${tier}`).trim();
    if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
    const size = this.parts.face.clientWidth;
    const scale = size / 640;
    // The mist is drawn to the face's size: the prototype's face was a whole
    // screen, and the same motes on a phone's dial read as smoke, not perfume.
    const k = Math.max(0.45, scale * 1.4);
    // The canvas spills past the face on every side (0.22 of its width), so mist rises off it.
    const [x, y] = polar(radius, hour);
    const cx = (x + 320) * scale + size * 0.22, cy = (y + 320) * scale + size * 0.22;
    for (let i = 0; i < count; i++) {
      this.air.emit({
        x: cx + (Math.random() - 0.5) * 10 * k,
        y: cy + (Math.random() - 0.5) * 10 * k,
        vx: (Math.random() - 0.5) * (strong ? 40 : 14) * k,
        vy: -(14 + Math.random() * (strong ? 46 : 22)) * k,
        r: (3 + Math.random() * (strong ? 6 : 4)) * k,
        grow: (strong ? 14 : 9) * k,
        peak: strong ? 0.34 : 0.42,
        max: (MS.mist / 1000) * (0.6 + Math.random() * 0.7),
        colour,
      });
    }
    this.wake();
  }
}
