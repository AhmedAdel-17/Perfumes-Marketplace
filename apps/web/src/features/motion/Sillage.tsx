'use client';

import { useEffect, useRef } from 'react';
import { glassPalette, scentFamily } from '@diyar/tokens';
import { canHover, prefersStill } from './motion';
import { Vapour } from './vapour';

/**
 * LE SILLAGE — the trail a perfume leaves in a room, left by the pointer as it
 * passes over a photograph (Les Détails, founder 19 Oct 2026;
 * design-reference/experiences/04-details.html, No. 01): a faint mist in the
 * perfume's colour that rises and thins behind the hand.
 *
 * Where: the home page's opening perfume — not the product page, whose
 * photograph is already the reveal and the loupe; one surface does one thing
 * under the pointer (the plan approved 19 Oct 2026). Never over text: it is
 * drawn inside the photograph's frame only.
 *
 * A mouse's effect — a finger has no path through the air before it lands —
 * and none at all for a visitor who asked for less motion. The canvas draws
 * only while there is mist in the air; at rest it costs nothing.
 *
 * The mist is the family's own colour, in both themes, because it hangs over
 * the photograph, which is the same in both. (Its lighter `mist` stop was
 * tried first and vanished into the pale grounds houses photograph on.)
 */
export function Sillage({ family }: { family: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current, frame = el?.parentElement;
    if (!el || !frame || !canHover() || prefersStill()) return;
    const air = new Vapour(el, { drag: [0.12, 0.7], sway: 16 });
    const colour = (scentFamily as Record<string, string>)[family] ?? glassPalette(family).core;
    let last: { x: number; y: number; t: number } | null = null;
    let loop = 0, prev = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - (prev || now)) / 1000);
      prev = now;
      loop = air.step(dt, now / 1000) ? requestAnimationFrame(draw) : 0;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const r = frame.getBoundingClientRect();
      const p = { x: event.clientX - r.left, y: event.clientY - r.top, t: performance.now() };
      if (last) {
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        const speed = d / Math.max(8, p.t - last.t);
        const steps = Math.min(10, Math.ceil(d / 7));
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          air.emit({
            x: last.x + (p.x - last.x) * k,
            y: last.y + (p.y - last.y) * k,
            vx: (p.x - last.x) * 0.6 + (Math.random() - 0.5) * 14,
            vy: -(10 + Math.random() * 16),
            r: 5 + Math.random() * 6,
            grow: 26 + Math.min(40, speed * 30),
            peak: 0.12,
            max: 1.3 + Math.random() * 1.3,
            colour,
          });
        }
        if (!loop) { prev = 0; loop = requestAnimationFrame(draw); }
      }
      last = p;
    };
    const leave = () => { last = null; };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerleave', leave);
    return () => {
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(loop);
      air.clear();
    };
  }, [family]);

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />;
}
