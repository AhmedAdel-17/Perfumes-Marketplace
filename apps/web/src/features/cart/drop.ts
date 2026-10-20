import { Icon } from '@diyar/ui';
import { glassPalette, scentFamily } from '@diyar/tokens';
import { EASE, MS, lerp, prefersStill } from '@/features/motion/motion';

/**
 * LA GOUTTE — the drop that carries a perfume to the bag (Les Détails, founder
 * 19 Oct 2026; design-reference/experiences/04-details.html, No. 02).
 *
 * Pressing "add to bag" lets a drop of the perfume leave the button and fly, on
 * a curve, to the bag in the masthead; the bag answers when it lands — its
 * count rises to the new number and it breathes its spritz.
 *
 * Pattern — an IMPERATIVE FLIGHT and a one-slot OBSERVER. The flight draws
 * itself on a fixed overlay for its own length and then removes itself; React
 * is not asked to render sixty frames of a drop. The bag learns that a drop is
 * on its way through `pendingDrop()`, and waits for it before answering, so the
 * count changes when the drop ARRIVES rather than when the button is pressed.
 * The CART is updated at once, whatever the drop does: a navigation in the
 * middle of a flight must never lose a bottle.
 *
 * Law VI: a response to a press, so within `slow`, on the in-out curve — the
 * drop leaves gently and settles into the bag. Nothing overshoots: the
 * prototype's bag jumped as it took the drop (a scale past one and back), which
 * is a bounce, and it was left out (tokens.json, `easing.$forbidden`).
 */

/** The bag in the masthead marks itself with this; the drop aims at it. */
export const BAG_TARGET = 'data-bag-target';

const NS = 'http://www.w3.org/2000/svg';

let pending: Promise<void> | null = null;

/** The drop on its way to the bag, if there is one. Settles when it lands. */
export const pendingDrop = (): Promise<void> | null => pending;

/**
 * The perfume's colour on whatever ground the button stands: the family's own
 * colour on paper; on the dark theme the lighter `core` of its glass, because
 * an oud drop in the family's colour would vanish into the room.
 */
function coloursFor(family: string, from: Element): { body: string; glint: string } {
  const glass = glassPalette(family);
  const dark = from.closest('[data-theme]')?.getAttribute('data-theme') === 'dark';
  const body = dark ? glass.core : ((scentFamily as Record<string, string>)[family] ?? glass.core);
  return { body, glint: glass.mist };
}

/**
 * Sends a drop from `from` to the bag. Does nothing for a visitor who asked for
 * less motion, or where there is no bag on the page to receive it (the reveal's
 * dark room stands over the masthead, so its button passes `drop={false}`).
 */
export function flyDrop(from: HTMLElement, family: string): void {
  if (prefersStill()) return;
  // Looked for again on every frame: for the first bottle the masthead holds
  // only the bag's empty mark, and the bag itself appears while the drop is in
  // the air — the drop turns toward it.
  const bag = () => document.querySelector<HTMLElement>(`[${BAG_TARGET}]`);
  if (!bag()) return;

  const { body, glint } = coloursFor(family, from);
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('class', 'drop-flight');
  overlay.setAttribute('aria-hidden', 'true');
  const drop = document.createElementNS(NS, 'g');
  const shape = document.createElementNS(NS, 'path');
  shape.setAttribute('d', Icon.amberPath);
  shape.setAttribute('transform', 'translate(-12 -13)');
  shape.style.fill = body;
  const shine = document.createElementNS(NS, 'ellipse');
  for (const [k, v] of [['cx', '-1.6'], ['cy', '1.5'], ['rx', '1.3'], ['ry', '2.4'], ['transform', 'rotate(-20)']] as const) {
    shine.setAttribute(k, v);
  }
  shine.style.fill = glint;
  shine.style.opacity = '0.75';
  drop.append(shape, shine);
  overlay.append(drop);
  document.body.append(overlay);

  const a = from.getBoundingClientRect();
  const p0 = { x: a.left + a.width / 2, y: a.top + 6 };
  let p2 = p0;
  const aim = () => {
    const target = bag()?.getBoundingClientRect();
    if (target) p2 = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
  };
  aim();

  const start = performance.now();
  let lastTrail = 0;
  pending = new Promise<void>((landed) => {
    const frame = (now: number) => {
      aim();
      const k = Math.min(1, (now - start) / MS.slow);
      const e = EASE.inOut(k);
      // Up and over: the curve's handle sits above the bag, a third of the way
      // across, so the drop rises out of the button and falls into the bag.
      const p1 = { x: lerp(p0.x, p2.x, 0.35), y: Math.min(p0.y, p2.y) - 34 };
      const x = (1 - e) ** 2 * p0.x + 2 * (1 - e) * e * p1.x + e * e * p2.x;
      const y = (1 - e) ** 2 * p0.y + 2 * (1 - e) * e * p1.y + e * e * p2.y;
      const vx = 2 * (1 - e) * (p1.x - p0.x) + 2 * e * (p2.x - p1.x);
      const vy = 2 * (1 - e) * (p1.y - p0.y) + 2 * e * (p2.y - p1.y);
      // The tip trails the flight, as a falling drop's does, and it shrinks as
      // it goes: it is being taken in.
      const turn = (Math.atan2(-vx, vy) * 180) / Math.PI;
      const scale = 1.15 - 0.55 * e;
      drop.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${turn.toFixed(1)}) scale(${scale.toFixed(3)})`);
      if (now - lastTrail > 26 && k < 0.92) {
        lastTrail = now;
        const bead = document.createElementNS(NS, 'circle');
        bead.setAttribute('cx', x.toFixed(1));
        bead.setAttribute('cy', y.toFixed(1));
        bead.setAttribute('r', (1.6 * scale).toFixed(2));
        bead.setAttribute('class', 'drop-trail');
        bead.style.fill = body;
        overlay.append(bead);
      }
      if (k < 1) { requestAnimationFrame(frame); return; }
      drop.remove();
      landed();
      // The trail fades on its own; the overlay goes once it has.
      window.setTimeout(() => overlay.remove(), MS.slow);
    };
    requestAnimationFrame(frame);
  });
  const mine = pending;
  void mine.then(() => { if (pending === mine) pending = null; });
}
