/**
 * The reveal's choreography — Le Dévoilement (founder, 18–19 Oct 2026;
 * design-reference/experiences/01-devoilement.html, the approved prototype).
 *
 *   1. The photograph lifts off the page and flies to the middle of the room
 *      as the room dims — the immediate answer to the press, within `slow`.
 *   2. The object is laid EXACTLY over the bottle in the picture, flat and in
 *      the photograph's own light, so the two cannot be told apart; the
 *      picture dissolves around it and leaves the bottle in the dark room.
 *   3. It stands up out of the picture — upright, its faces rising out of the
 *      flat image, the room's light finding the glass, its reflection last.
 *      An arrival the visitor asked for, so it takes `ceremony`.
 *   4. Its notes are released from the nozzle, a spritz for each tier — top,
 *      heart, base — and orbit it at the three heights a perfume is described
 *      at, passing in front of the glass and behind it.
 *   Closing runs it back: the notes return to the nozzle, and the bottle lies
 *   down into its photograph as the lights come up.
 *
 * AS THE WAY INTO A PAGE (founder, 20 Oct 2026). The first time a perfume is
 * opened in a visit, all of it plays as the passage from a card to the
 * perfume's page (`arrive`): it lifts the CARD's photograph, the page changes
 * behind the dark room, and the closing lays the bottle down into the
 * photograph at the top of the NEW page (`home`). Any press cuts it short
 * (`skip`) from wherever it has got to — still in the air, the photograph
 * itself flies on into the page's; rising or standing, the bottle lies down
 * from where it is. Nothing is replayed to get there.
 *
 * Pattern — an IMPERATIVE CONTROLLER behind a presentational component
 * (ENGINEERING_PRINCIPLES §4, presentational/container split). React renders
 * the stage's parts once; this moves them, sixty times a second, through one
 * frame loop and one clock (`Tweens`). A choreography of this kind expressed
 * as React state would re-render the tree every frame. Its course is a STATE
 * machine (`phase`): each step asks where the visitor has taken it before it
 * goes on, so a close, a skip or a failed load each leave the page exactly as
 * a finished reveal would.
 *
 * Nothing about the packaging is invented: the object is the house's own
 * photograph (`makeRelief` in the domain) — see the panel's note.
 */
import { BottleGL, type Placement, type Pose, type Rect } from './bottle-gl';
import { Mist } from './mist';
import { EASE, MS, Tweens, lerp } from '@/features/motion/motion';

export type Tier = 'top' | 'heart' | 'base';
export const TIERS: readonly Tier[] = ['top', 'heart', 'base'];

/** Each tier's orbit: where on the bottle (0 its top), how wide against it, how fast and which way. */
const RING: Record<Tier, { v: number; r: number; speed: number }> = {
  top: { v: -0.16, r: 1.42, speed: 0.1 },
  heart: { v: 0.42, r: 1.16, speed: -0.075 },
  base: { v: 0.86, r: 0.98, speed: 0.06 },
};

/** How long a note takes to rise from the nozzle to its ring, in seconds. */
const BIRTH_S = 1.25;

export interface Chip { readonly el: HTMLElement; readonly tier: Tier; readonly index: number; readonly count: number }

export interface StageParts {
  readonly root: HTMLElement;
  readonly glass: HTMLCanvasElement;
  readonly mist: HTMLCanvasElement;
  readonly plinth: HTMLElement;
  readonly guides: Partial<Record<Tier, HTMLElement>>;
  readonly hint: HTMLElement | null;
  readonly panel: HTMLElement;
  /** The photograph's frame on the page: where the bottle comes from. */
  readonly frame: HTMLElement;
}

export interface StageSetup {
  readonly cutoutUrl: string;
  readonly reliefUrl: string;
  readonly placement: Placement;
  /** The photograph's own size: the frame shows it `object-fit: cover`. */
  readonly photo: { readonly width: number; readonly height: number };
  readonly mistColour: string;
  readonly still: boolean;
  readonly onStanding: () => void;
  readonly onLeaving: () => void;
  readonly onClosed: () => void;
}

interface ChipMotion {
  readonly chip: Chip; readonly angle0: number; born: number; recall: number;
  /** Half the chip's size, measured once when it first shows — never read again each frame. */
  half: { w: number; h: number } | null;
}

/** A promise, and the hand that settles it. */
interface Signal { readonly promise: Promise<void>; readonly resolve: () => void }

function signal(): Signal {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const px = (n: number) => `${n.toFixed(1)}px`;
const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  left: lerp(a.left, b.left, k), top: lerp(a.top, b.top, k),
  width: lerp(a.width, b.width, k), height: lerp(a.height, b.height, k),
});

/** Where an image drawn `object-fit: cover` in a frame actually is — the whole image, overflow included. */
function coverRect(frame: DOMRect, width: number, height: number): Rect {
  const s = Math.max(frame.width / width, frame.height / height);
  const w = width * s, h = height * s;
  return { left: frame.left + (frame.width - w) / 2, top: frame.top + (frame.height - h) / 2, width: w, height: h };
}

export class RevealController {
  private readonly glass: BottleGL;
  private readonly mist: Mist;
  private readonly tweens: Tweens;
  private readonly wide = window.matchMedia('(min-width: 1024px)');
  /**
   * `held`: pressed through while it was rising — the bottle stays where it
   * had got to, half-stood, until the page it lies down into is there.
   */
  private phase: 'idle' | 'flying' | 'rising' | 'held' | 'open' | 'closing' | 'closed' = 'idle';
  /** 0 while the object is still the photograph — no tilt, no bob; 1 once it stands. */
  private settle = 0;
  private readonly look = { rx: 0, ry: 0, light: [0.35, 0.55, 1] as [number, number, number] };
  private pointer = { x: 0, y: 0, active: false };
  private held = { x: 0, y: 0 };
  private nozzle = { x: 0, y: 0 };
  private chips: ChipMotion[] = [];
  private raf = 0;
  private last = performance.now();
  private flier: HTMLImageElement | null = null;
  /** Escape pressed while the bottle was still rising: honoured the moment it stands. */
  private closeAsked = false;
  /** The photograph the bottle goes back into: the one it came from, or — on the way into a page — the page's. */
  private plate: HTMLElement;
  /** The picture hidden while its photograph is in the air, given back however the reveal ends. */
  private lifted: HTMLImageElement | null = null;
  /** The reveal is the way into a page (`arrive`), not a dialog opened in place. */
  private arriving = false;
  /** Settled once `plate` is the page's own photograph. */
  private readonly homed = signal();
  /** Pressed through: on the way into a page, straight there. */
  private skipped = false;
  private readonly skipping = signal();
  /** When the bottle stood up; null until then. */
  private stoodAt: number | null = null;
  /** An arrival waiting for the notes to have had their moment — released by the frame loop. */
  private lingering: (() => void) | null = null;

  constructor(private readonly parts: StageParts, private readonly setup: StageSetup) {
    this.plate = parts.frame;
    this.glass = new BottleGL(parts.glass);
    this.mist = new Mist(parts.mist, setup.mistColour);
    this.tweens = new Tweens(setup.still);
    // Unseen until it is laid over its own photograph.
    this.glass.state.opacity = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * The room's state lives in a DATA attribute, not a class: React owns the
   * stage's `className` and rewrites it whenever the panel appears, which
   * would wipe a class set from here mid-reveal.
   */
  private room(dark: boolean): void {
    this.parts.root.dataset.room = dark ? 'dark' : 'lit';
  }

  // ------------------------------------------------------------------ input

  /** The light follows the pointer; on a touch screen, the finger while it is down. */
  pointerMove(x: number, y: number, active: boolean): void {
    this.pointer = { x, y, active };
  }

  /**
   * The notes, as the stage has drawn them — handed over when they are known:
   * at once when the reveal is opened on the perfume's page, with the page
   * when it is the way into one. The same elements handed over again (a
   * re-render) keep their motion.
   */
  notes(chips: readonly Chip[]): void {
    const same = chips.length === this.chips.length && chips.every((c, i) => this.chips[i]?.chip.el === c.el);
    if (same) return;
    this.chips = chips.map((chip) => ({
      chip,
      angle0: (chip.index / chip.count) * Math.PI * 2 + (chip.tier === 'heart' ? 0.5 : chip.tier === 'base' ? 1.1 : 0),
      born: Number.POSITIVE_INFINITY,
      recall: 0,
      half: null,
    }));
    // Words that came after the bottle stood (a slow page) come out now.
    if (this.phase === 'open') this.bear(performance.now());
  }

  // ------------------------------------------------------------------ layout

  private photoImage(): HTMLImageElement | null { return this.plate.querySelector('img'); }

  private photoRect(): Rect {
    return coverRect(this.plate.getBoundingClientRect(), this.setup.photo.width, this.setup.photo.height);
  }

  /** The middle of the room the panel leaves free: beside it on a desktop, above it on a phone. */
  private free() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const p = this.parts.panel.getBoundingClientRect();
    if (this.wide.matches) {
      const panelOnRight = p.left + p.width / 2 > vw / 2;
      const left = panelOnRight ? 0 : p.right, right = panelOnRight ? p.left : vw;
      return { cx: (left + right) / 2, cy: vh * 0.45, width: right - left, height: vh };
    }
    const top = Math.max(160, p.top);
    return { cx: vw / 2, cy: top * 0.5, width: vw, height: top };
  }

  private standingPose(): Pose {
    const f = this.free();
    // On a phone the bottle must also fit across the screen: a wide flacon is limited by width.
    const heightPx = this.wide.matches
      ? window.innerHeight * 0.48
      : Math.min(f.height * 0.56, (f.width * 0.5) / Math.max(this.glass.shape, 0.2));
    return this.glass.poseStanding(f.cx, f.cy, heightPx);
  }

  /** Where the photograph lands: its own shape, centred in the free room. */
  private flierTarget(): Rect {
    const f = this.free();
    const aspect = this.setup.photo.width / this.setup.photo.height;
    let h = this.wide.matches ? window.innerHeight * 0.62 : f.height * 0.82;
    let w = h * aspect;
    if (w > f.width * 0.9) { w = f.width * 0.9; h = w / aspect; }
    return { left: f.cx - w / 2, top: f.cy - h / 2, width: w, height: h };
  }

  private place(flier: HTMLElement, r: Rect): void {
    Object.assign(flier.style, { left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) });
  }

  // ------------------------------------------------------------------ open

  async open(): Promise<void> {
    if (this.phase !== 'idle') return;
    this.phase = 'flying';
    const { root } = this.parts;
    const img = this.photoImage();
    const start = this.plate.getBoundingClientRect();
    const loading = this.glass.load(this.setup.cutoutUrl, this.setup.reliefUrl);

    // 1. The photograph itself lifts off the page — the bytes already loaded.
    const flier = document.createElement('img');
    flier.src = img?.currentSrc || img?.src || '';
    flier.alt = '';
    flier.className = 'reveal-flier';
    this.place(flier, start);
    root.append(flier);
    this.flier = flier;
    if (img) { img.style.visibility = 'hidden'; this.lifted = img; }
    this.room(true);

    const to = this.flierTarget();
    await this.tweens.run(MS.slow, EASE.entrance, (k) => this.place(flier, lerpRect(start, to, k)), true);
    // Pressed through while it was in the air: there is no bottle yet, only the
    // photograph — it goes on, from where it is, into the page's own.
    if (this.skipped) return this.landPhotograph(flier);
    const loaded = await Promise.race([
      loading.then(() => 'ready' as const, (error: unknown) => ({ error })),
      this.skipping.promise.then(() => 'skipped' as const),
    ]);
    if (typeof loaded === 'object') {
      this.abort(loaded.error);
      return;
    }
    if (this.skipped) return this.landPhotograph(flier);

    // 2. The object over its own picture, flat and in the picture's light.
    const over = this.glass.poseOver(to, this.setup.placement);
    Object.assign(this.glass.state, over, { opacity: 1, relight: 0, depth: 0, reflect: 0 });
    this.settle = 0;
    this.phase = 'rising';
    await nextFrame();
    const dissolve = this.tweens.run(MS.slow, EASE.inOut, (k) => {
      flier.style.opacity = String(1 - k);
      flier.style.filter = `blur(${(k * 10).toFixed(1)}px)`;
    }).then(() => { flier.remove(); this.flier = null; });
    if (!this.setup.still && !this.skipped) await new Promise((r) => setTimeout(r, MS.quick));

    // 3. It stands up out of it.
    if (!this.skipped) {
      const stand = this.standingPose();
      const s = this.glass.state;
      await this.tweens.run(MS.ceremony, EASE.inOut, (k) => {
        s.x = lerp(over.x, stand.x, k); s.y = lerp(over.y, stand.y, k);
        s.scale = lerp(over.scale, stand.scale, k); s.rz = lerp(over.rz, 0, k);
        s.depth = Math.min(1, k * 1.5); s.relight = k;
        s.reflect = Math.max(0, (k - 0.55) / 0.45);
        this.settle = k;
      }, true);
    }
    // Pressed through as it rose: it stays where it had got to — the picture
    // still dissolving around it — and lies down into the page from there.
    if (this.skipped) { this.phase = 'held'; return; }
    await dissolve;
    this.phase = 'open';
    this.stoodAt = performance.now();
    this.setup.onStanding();
    if (this.closeAsked) { void this.close(); return; }
    this.bear(this.stoodAt);
  }

  /** 4. The notes, tier by tier, each with a spritz. */
  private bear(now: number): void {
    TIERS.forEach((tier, t) => {
      const delay = this.setup.still ? 0 : 250 + t * MS.base * 2;
      for (const c of this.chips.filter((m) => m.chip.tier === tier)) c.born = now + delay + (this.setup.still ? 0 : c.chip.index * 170);
      if (!this.setup.still) window.setTimeout(() => this.phase === 'open' && this.mist.burst(this.nozzle), delay - 60);
      const guide = this.parts.guides[tier];
      if (guide) window.setTimeout(() => { if (this.phase === 'open') guide.dataset.on = 'true'; }, delay + 300);
    });
  }

  /** The bottle could not be drawn: put the photograph back, and leave the page as it was. */
  private abort(error: unknown): void {
    console.warn('The reveal could not load its relief; the page is left as it was.', error);
    this.flier?.remove();
    this.flier = null;
    if (this.lifted) this.lifted.style.visibility = '';
    this.room(false);
    this.phase = 'closed';
    this.setup.onClosed();
  }

  // ------------------------------------------------------------------ the way into a page

  /**
   * The reveal as the way into the perfume's page: all of it, then the bottle
   * lies down into the photograph at the top of the page that has arrived
   * behind the room. A press at any point goes straight there (`skip`).
   */
  async arrive(): Promise<void> {
    this.arriving = true;
    await this.open();
    if (this.phase !== 'open' && this.phase !== 'held') return;
    await this.homed.promise;
    if (!this.skipped) await new Promise<void>((go) => { this.lingering = go; });
    await this.close();
  }

  /**
   * The page the reveal leads to has arrived behind the room: from now on the
   * bottle goes back into the photograph at its top — hidden until it does, so
   * the picture is never there twice. The card's picture, if its element
   * outlived the old page, is given back now.
   */
  home(plate: HTMLElement): void {
    if (this.lifted && this.lifted !== plate.querySelector('img')) this.lifted.style.visibility = '';
    this.plate = plate;
    const img = this.photoImage();
    if (img) { img.style.visibility = 'hidden'; this.lifted = img; }
    this.homed.resolve();
  }

  /**
   * A press on the way in: straight to the page, from wherever the reveal has
   * got to. False when there is nothing left to cut short — it is already
   * lying down, or this is the dialog, which closes instead.
   */
  skip(): boolean {
    if (!this.arriving || this.skipped || this.phase === 'closing' || this.phase === 'closed') return false;
    this.skipped = true;
    this.skipping.resolve();
    // The flight or the rise stops where it is; the landing starts from there.
    this.tweens.interrupt();
    return true;
  }

  /** When the last note has reached its ring and been seen there a moment. */
  private lingerUntil(): number {
    const births = this.chips.map((c) => c.born).filter(Number.isFinite);
    const lastSeen = births.length > 0 ? Math.max(...births) + BIRTH_S * 1000 : this.stoodAt ?? 0;
    return lastSeen + MS.slow;
  }

  /**
   * Pressed through before the bottle stood: the photograph flies on into the
   * page's — the same picture, in the same frame — and simply becomes it.
   */
  private async landPhotograph(flier: HTMLImageElement): Promise<void> {
    this.phase = 'closing';
    this.setup.onLeaving();
    await this.homed.promise;
    const from = flier.getBoundingClientRect();
    this.room(false);
    await this.tweens.run(MS.slow, EASE.inOut, (k) => this.place(flier, lerpRect(from, this.plate.getBoundingClientRect(), k)));
    if (this.lifted) this.lifted.style.visibility = '';
    await this.tweens.run(MS.quick, EASE.inOut, (k) => { flier.style.opacity = String(1 - k); });
    flier.remove();
    this.flier = null;
    this.finish();
  }

  /**
   * The page never came to land in — the visitor went back, or it failed —
   * and the room simply lifts over whatever page is there, within `base`.
   */
  dismiss(): void {
    if (this.phase === 'closing' || this.phase === 'closed') return;
    this.phase = 'closing';
    // Whatever was moving stops where it is; nothing waits on it any more.
    this.tweens.clear();
    this.lingering = null;
    this.setup.onLeaving();
    this.room(false);
    const { root } = this.parts;
    root.style.transition = `opacity ${MS.base}ms`;
    root.style.opacity = '0';
    window.setTimeout(() => this.finish(), MS.base);
  }

  // ------------------------------------------------------------------ close

  async close(): Promise<void> {
    if (this.phase === 'flying' || this.phase === 'rising') { this.closeAsked = true; return; }
    if (this.phase !== 'open' && this.phase !== 'held') return;
    this.phase = 'closing';
    this.setup.onLeaving();
    // The notes go back into the nozzle — those that came out; the rest never will.
    const now = performance.now();
    const out = this.chips.filter((c) => c.born <= now);
    for (const c of this.chips) if (c.born > now) c.born = Number.POSITIVE_INFINITY;
    await Promise.all(out.map((c) => this.tweens.run(MS.base, EASE.inOut, (k) => { c.recall = k; })));
    for (const guide of Object.values(this.parts.guides)) if (guide) delete guide.dataset.on;

    // …and the bottle lies back down into its photograph as the lights come
    // up — from wherever it had got to: all the way up, or part-way when the
    // visitor pressed through as it rose.
    this.room(false);
    const s = this.glass.state;
    const from = { x: s.x, y: s.y, scale: s.scale, rz: s.rz, relight: s.relight, depth: s.depth, reflect: s.reflect, settle: this.settle };
    const into = this.glass.poseOver(this.photoRect(), this.setup.placement);
    await this.tweens.run(MS.slow, EASE.inOut, (k) => {
      s.x = lerp(from.x, into.x, k); s.y = lerp(from.y, into.y, k);
      s.scale = lerp(from.scale, into.scale, k); s.rz = lerp(from.rz, into.rz, k);
      s.relight = from.relight * (1 - k);
      s.depth = from.depth * Math.max(0, 1 - k * 1.4);
      s.reflect = from.reflect * Math.max(0, 1 - k * 2.5);
      this.settle = from.settle * (1 - k);
    });
    // The picture returns under it, and the object is gone into the picture.
    const img = this.photoImage();
    if (img) { img.style.opacity = '0'; img.style.visibility = ''; }
    await this.tweens.run(MS.quick, EASE.inOut, (k) => { if (img) img.style.opacity = String(k); });
    await this.tweens.run(MS.quick, EASE.inOut, (k) => { s.opacity = 1 - k; });
    if (img) img.style.opacity = '';
    this.finish();
  }

  private finish(): void {
    this.phase = 'closed';
    this.mist.clear();
    this.setup.onClosed();
  }

  /** Everything returned: the loop, the GPU's memory, the photographs' visibility. */
  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.tweens.clear();
    this.lingering = null;
    this.flier?.remove();
    for (const img of [this.lifted, this.photoImage()]) if (img) { img.style.visibility = ''; img.style.opacity = ''; }
    this.glass.dispose();
  }

  // ------------------------------------------------------------------ the frame

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    this.tweens.step(now);
    // Nothing to draw while the photograph is still in flight, nor once it is back.
    if (this.glass.ready && (this.phase === 'rising' || this.phase === 'held' || this.phase === 'open' || this.phase === 'closing')) {
      this.draw(now, t, dt);
    }
    // On the way in: the notes have had their moment, or the visitor pressed on.
    if (this.lingering && (this.skipped || now >= this.lingerUntil())) {
      const go = this.lingering;
      this.lingering = null;
      go();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(now: number, t: number, dt: number): void {
    const { still } = this.setup;
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = this.glass.state;

    // Look: turn toward the pointer, read against the bottle; drift when it is away.
    const dx = (this.pointer.x - this.held.x) / vw, dy = (this.pointer.y - this.held.y) / vh;
    const active = this.pointer.active;
    const tx = active ? clamp(dx * 0.9, -0.42, 0.42) : Math.sin(t * 0.35) * 0.12;
    const ty = active ? clamp(dy * 0.45, -0.16, 0.16) : Math.sin(t * 0.27) * 0.04;
    this.look.ry += (tx - this.look.ry) * Math.min(1, dt * 3.2);
    this.look.rx += (ty - this.look.rx) * Math.min(1, dt * 3.2);
    // The light comes from where the pointer is, around the bottle — never from
    // straight ahead, which would whiten the flat faces of the glass the way no
    // studio light does: always ~38° or more off the face, so the bevels catch it.
    let lx = active ? dx * 3.2 : Math.sin(t * 0.35) * 0.9;
    let ly = active ? -dy * 3.2 : 0.62;
    const m = Math.hypot(lx, ly), want = clamp(m, 0.8, 1.6);
    if (m > 1e-3) { lx *= want / m; ly *= want / m; } else { [lx, ly] = this.look.light; }
    this.look.light[0] += (lx - this.look.light[0]) * Math.min(1, dt * 4);
    this.look.light[1] += (ly - this.look.light[1]) * Math.min(1, dt * 4);

    if (this.phase === 'open') Object.assign(s, this.standingPose());
    s.ry = still ? 0 : this.look.ry * this.settle;
    s.rx = still ? 0 : this.look.rx * this.settle;
    s.lift = still ? 0 : Math.sin(t * 1.1) * 0.012 * this.settle;
    s.light = this.look.light;
    s.sweep = still ? -1 : ((t % 6) / 6) * 2.6 - 0.7;
    this.glass.render();

    // Where the bottle is on screen this frame.
    const top = this.glass.project(0.5, 0), foot = this.glass.project(0.5, 1);
    const left = this.glass.project(0, 0.5), right = this.glass.project(1, 0.5);
    const width = Math.abs(right.x - left.x), height = foot.y - top.y;
    const cx = (left.x + right.x) / 2;
    this.held = { x: cx, y: (top.y + foot.y) / 2 };
    this.nozzle = { x: top.x, y: top.y + 4 };

    Object.assign(this.parts.plinth.style, {
      transform: `translate(${px(cx)}, ${px(foot.y + 6)}) translate(-50%, -50%)`,
      width: px(width * 2.4), height: px(width * 0.5),
    });
    if (this.parts.hint) this.parts.hint.style.transform = `translateX(${px(cx)}) translateX(-50%)`;
    if (!still) this.mist.step(dt, t, this.nozzle, this.phase === 'open');

    // The notes: out of the nozzle on a rising arc, to their ring; then the slow orbit.
    const gap = this.wide.matches ? 90 : 34;
    // Kept on the screen, and clear of the close button above, on a phone as on a desktop.
    const margin = 8, ceiling = 76;
    for (const c of this.chips) {
      const ring = RING[c.chip.tier];
      const age = (now - c.born) / 1000;
      const el = c.chip.el;
      if (age < 0) { el.style.opacity = '0'; continue; }
      const birth = still ? 1 : EASE.out(Math.min(1, age / BIRTH_S));
      const angle = c.angle0 + (still ? 0 : t * ring.speed * Math.PI * 0.5);
      const rx = width * 0.5 * ring.r + gap, ry = rx * 0.17;
      const depth = Math.sin(angle);
      let x = cx + Math.cos(angle) * rx, y = top.y + height * ring.v + depth * ry;
      x = lerp(top.x, x, birth); y = lerp(top.y, y, birth) - Math.sin(Math.PI * birth) * 48;
      x = lerp(x, top.x, c.recall); y = lerp(y, top.y, c.recall);
      c.half ??= { w: el.offsetWidth / 2, h: el.offsetHeight / 2 };
      x = clamp(x, margin + c.half.w, vw - margin - c.half.w);
      y = Math.max(y, ceiling + c.half.h);
      // In front of the glass or behind it — the canvas sits between the two.
      el.style.zIndex = depth > -0.05 ? '3' : '1';
      const k = 0.8 + 0.2 * (depth + 1) / 2;
      el.style.opacity = (birth * (1 - c.recall) * (0.5 + 0.5 * (depth + 1) / 2)).toFixed(3);
      el.style.transform = `translate(${px(x)}, ${px(y)}) translate(-50%, -50%) scale(${(k * (0.6 + 0.4 * birth)).toFixed(3)})`;
    }
    for (const tier of TIERS) {
      const guide = this.parts.guides[tier];
      if (guide) guide.style.top = px(top.y + height * RING[tier].v - 8);
    }
  }
}
