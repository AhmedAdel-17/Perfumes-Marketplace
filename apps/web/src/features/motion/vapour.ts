/**
 * Perfume in the air, drawn as soft motes on a 2D canvas: the sillage a pointer
 * leaves over a photograph (Les Détails), and the notes evaporating off the
 * day-on-the-skin dial (La Durée).
 *
 * Pattern — a small IMPERATIVE PARTICLE SYSTEM owned by the frame loop of the
 * component that uses it (the same split as the reveal's stage: React renders
 * the canvas once, this draws on it). Each mote rises, sways in the air it
 * passes through, swells and fades on a half sine, so it arrives and leaves
 * without an edge — mist has none.
 *
 * Why not the reveal's `Mist`: that is the stage's PLUME — a steady column
 * from a nozzle, screen-composited on the dark room, swaying more the higher
 * it rises above the bottle. These motes have no source; they are left behind
 * by something that moved, drawn on whichever ground the page has, and each
 * may carry its own colour (a tier of notes on the dial). Folding the two
 * together would trade a measured, shipped effect for a configuration object.
 *
 * Nothing here runs when nothing is in the air: `step` reports whether any
 * mote is left, and the owner stops its loop when none is.
 */
export interface Puff {
  x: number;
  y: number;
  /** Initial velocity, px/s. Negative y rises. */
  vx: number;
  vy: number;
  /** Radius at birth and how much it swells by the end of its life, px. */
  r: number;
  grow: number;
  /** Opacity at the middle of its life. Low: many motes make one haze. */
  peak: number;
  /** Lifetime, seconds. */
  max: number;
  /** A #rrggbb colour — a scent family's, or a tier's. */
  colour: string;
}

interface Mote extends Puff { life: number; seed: number; sprite: HTMLCanvasElement }

export interface VapourOptions {
  /** How fast the air slows each mote, per second: [sideways, upward]. Lower is stiller air. */
  readonly drag?: readonly [number, number];
  /** How far the air sways a mote, px/s². */
  readonly sway?: number;
  /** The most motes in the air at once; the oldest give way. */
  readonly limit?: number;
}

const SPRITE = 64;

export class Vapour {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly motes: Mote[] = [];
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private readonly drag: readonly [number, number];
  private readonly sway: number;
  private readonly limit: number;

  constructor(private readonly canvas: HTMLCanvasElement, options: VapourOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.drag = options.drag ?? [0.12, 0.7];
    this.sway = options.sway ?? 16;
    this.limit = options.limit ?? 500;
  }

  emit(puff: Puff): void {
    this.motes.push({ ...puff, life: 0, seed: Math.random() * 10, sprite: this.sprite(puff.colour) });
    if (this.motes.length > this.limit) this.motes.splice(0, this.motes.length - this.limit);
  }

  get empty(): boolean { return this.motes.length === 0; }

  /** One frame. Returns whether anything is still in the air. */
  step(dt: number, t: number): boolean {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const [dx, dy] = this.drag;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!;
      m.life += dt;
      if (m.life > m.max) { this.motes.splice(i, 1); continue; }
      m.vx *= Math.pow(dx, dt);
      m.vy *= Math.pow(dy, dt);
      // The air it passes through: a slow sway, each mote on its own phase.
      m.vx += Math.sin(t * 1.1 + m.seed + m.life * 1.4) * this.sway * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const k = m.life / m.max, r = m.r + k * m.grow;
      ctx.globalAlpha = m.peak * Math.sin(Math.PI * k);
      ctx.drawImage(m.sprite, m.x - r, m.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    return this.motes.length > 0;
  }

  clear(): void {
    this.motes.length = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** One soft disc per colour, drawn once: a shoulder rather than a cone, so neighbours merge. */
  private sprite(colour: string): HTMLCanvasElement {
    const found = this.sprites.get(colour);
    if (found) return found;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = SPRITE;
    const g = sprite.getContext('2d');
    if (g) {
      const [r, gr, b] = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16)) as [number, number, number];
      const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      grad.addColorStop(0.4, `rgba(${r},${gr},${b},0.45)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE, SPRITE);
    }
    this.sprites.set(colour, sprite);
    return sprite;
  }
}
