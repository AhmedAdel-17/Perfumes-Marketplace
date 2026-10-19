/**
 * The perfume in the air: a plume rising from the nozzle while the reveal is
 * open, and a spritz each time a tier of notes is released.
 *
 * Canvas 2D, drawn at half resolution and softened by the stylesheet — mist has
 * no edges, so the pixels would be spent on nothing. Composited with `screen`,
 * so overlapping motes deepen the family's colour without burning to white.
 */
interface Mote {
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; peak: number;
  life: number; max: number; seed: number;
}

export class Mist {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprite: HTMLCanvasElement;
  private readonly motes: Mote[] = [];
  private debt = 0;

  constructor(private readonly canvas: HTMLCanvasElement, colour: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.sprite = document.createElement('canvas');
    this.sprite.width = this.sprite.height = 64;
    const g = this.sprite.getContext('2d');
    if (g) {
      const [r, gr, b] = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16)) as [number, number, number];
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      // A soft shoulder rather than a cone, so neighbouring motes merge into one haze.
      grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      grad.addColorStop(0.35, `rgba(${r},${gr},${b},0.55)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
  }

  /** A spritz: a cone of fast motes from the nozzle, as when the bulb is squeezed. */
  burst(at: { x: number; y: number }, n = 22): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
      const v = 60 + Math.random() * 90;
      this.motes.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 6 + Math.random() * 6, grow: 64, peak: 0.2, life: 0, max: 1.6 + Math.random() * 1.2, seed: Math.random() * 10 });
    }
  }

  /** One frame. `flowing` keeps the plume coming; without it the air simply clears. */
  step(dt: number, t: number, at: { x: number; y: number }, flowing: boolean): void {
    const ratio = 0.5;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * ratio)) { this.canvas.width = Math.round(w * ratio); this.canvas.height = Math.round(h * ratio); }
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (flowing) {
      // A steady thirty motes a second, whatever the frame rate.
      this.debt += 30 * dt;
      while (this.debt >= 1) {
        this.debt -= 1;
        this.motes.push({ x: at.x + (Math.random() - 0.5) * 6, y: at.y, vx: (Math.random() - 0.5) * 10, vy: -(34 + Math.random() * 30), r: 4 + Math.random() * 4, grow: 70, peak: 0.13, life: 0, max: 4.2 + Math.random() * 2.4, seed: Math.random() * 10 });
      }
    }
    ctx.globalCompositeOperation = 'screen';
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!;
      m.life += dt;
      if (m.life > m.max) { this.motes.splice(i, 1); continue; }
      // The air it rises through sways it, more the higher it goes, as smoke.
      const sway = Math.sin((at.y - m.y) * 0.018 + t * 0.7 + m.seed) * Math.min(1, m.life / 1.5);
      m.vx += sway * 26 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.vx *= Math.pow(0.6, dt); m.vy *= Math.pow(0.86, dt);
      const k = m.life / m.max, r = m.r + k * m.grow;
      ctx.globalAlpha = m.peak * Math.sin(Math.PI * k);
      ctx.drawImage(this.sprite, m.x - r, m.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void { this.motes.length = 0; }
}
