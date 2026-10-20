'use client';

import { useEffect, useRef } from 'react';
import { LENS, withAlpha } from '@diyar/tokens';
import { MS, prefersStill } from '@/features/motion/motion';
import { lensFit, lensOffset } from './loupe-fit';

/**
 * LA LOUPE — a glass held over the house's photograph (Les Détails, founder
 * 19 Oct 2026; design-reference/experiences/04-details.html, No. 03): the cap,
 * the shoulder, the colour of the juice — the details that tell one perfume
 * from another, which a photograph the size of a phone hides.
 *
 * Under a mouse it follows the pointer; under a finger it comes with a long
 * press and stands ABOVE the finger, which would otherwise cover what it
 * magnifies. While it is up, the page does not scroll under that finger, and
 * lifting it never opens the reveal the photograph also is.
 *
 * Honest about resolution: it magnifies up to ×2.4, and never past what the
 * house's photograph holds — a photograph shown larger than its own pixels
 * shows blur, not detail. The power it reaches is printed under the glass, and
 * where a photograph has too little to show (less than ×1.3 at this size) there
 * is no loupe at all. The large copy loads on first use, never with the page.
 *
 * Pattern — an imperative controller in an effect, as the reveal's stage is:
 * one frame loop moves one element while the glass is up and stops when it is
 * put down. Decorative to assistive technology: the photograph's own
 * description stands, and the reveal is the keyboard's way to look closer.
 */
const SIZE = 156;
/** How long a finger must rest before the glass comes. */
const HOLD_MS = 350;
/** A finger that travels further than this before then is scrolling, not holding. */
const SLOP = 10;

export function Loupe({ src, width, naturalWidth, naturalHeight }: {
  /** The large copy — `loupeSource`. */
  src: string;
  /** Its true width in pixels. */
  width: number;
  /** The photograph's own size, for its crop in the frame. */
  naturalWidth: number;
  naturalHeight: number;
}) {
  const glass = useRef<HTMLDivElement>(null);
  const power = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const lens = glass.current, label = power.current, plate = lens?.parentElement;
    if (!lens || !label || !plate) return;
    plate.dataset.loupe = 'ready';

    let loaded: Promise<boolean> | null = null;
    const load = () => (loaded ??= new Promise<boolean>((done) => {
      const image = new Image();
      image.onload = () => { lens.style.backgroundImage = `url("${src}")`; done(true); };
      image.onerror = () => done(false);
      image.src = src;
    }));

    // The photograph's crop in its frame and the power the large copy can
    // honestly reach at this size (loupe-fit.ts).
    let fit = lensFit({ w: 1, h: 1 }, { w: naturalWidth, h: naturalHeight }, width);
    const measure = () => {
      fit = lensFit({ w: plate.clientWidth, h: plate.clientHeight }, { w: naturalWidth, h: naturalHeight }, width);
      const { scale, zoom } = fit;
      lens.style.backgroundSize = `${(naturalWidth * scale * zoom).toFixed(1)}px ${(naturalHeight * scale * zoom).toFixed(1)}px`;
      label.textContent = `× ${zoom.toFixed(1)}`;
      return fit.usable;
    };

    let goal: { x: number; y: number } | null = null;
    let at: { x: number; y: number } | null = null;
    let lift = 0, frame = 0, last = 0, up = false;
    const draw = (now: number) => {
      if (!goal) { frame = 0; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      // A glass has weight: it follows the hand, it does not jump to it.
      const k = prefersStill() || !at ? 1 : 1 - Math.exp(-dt * 18);
      at = at ? { x: at.x + (goal.x - at.x) * k, y: at.y + (goal.y - at.y) * k } : { ...goal };
      const behind = lensOffset(fit, at, SIZE);
      lens.style.backgroundPosition = `${behind.x.toFixed(1)}px ${behind.y.toFixed(1)}px`;
      lens.style.transform = `translate(${at.x.toFixed(1)}px, ${(at.y - lift).toFixed(1)}px) translate(-50%, -50%)`;
      frame = requestAnimationFrame(draw);
    };
    const point = (event: PointerEvent) => {
      const r = plate.getBoundingClientRect();
      return { x: Math.min(r.width, Math.max(0, event.clientX - r.left)), y: Math.min(r.height, Math.max(0, event.clientY - r.top)) };
    };
    const show = async (event: PointerEvent, touch: boolean) => {
      if (!measure()) return;
      goal = point(event);
      lift = touch ? SIZE * 0.72 : 0;
      up = true;
      plate.dataset.loupe = 'on';
      if (!frame) { last = 0; frame = requestAnimationFrame(draw); }
      if (await load() && up) lens.dataset.on = '';
    };
    const hide = () => {
      up = false;
      goal = null;
      at = null;
      delete lens.dataset.on;
      plate.dataset.loupe = 'ready';
    };

    let hold = 0, start: { x: number; y: number } | null = null, swallow = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { hide(); return; } // the press is the reveal's
      start = { x: event.clientX, y: event.clientY };
      window.clearTimeout(hold);
      hold = window.setTimeout(() => { void show(event, true); }, HOLD_MS);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        if (!up) void show(event, false);
        else goal = point(event);
        return;
      }
      if (up) { goal = point(event); return; }
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) window.clearTimeout(hold);
    };
    const lifted = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      window.clearTimeout(hold);
      hold = 0;
      start = null;
      if (!up) return;
      hide();
      // The click this lift may still produce belongs to the glass. Only for a
      // moment: a lift after the finger travelled produces none, and the next
      // real press must not be the one swallowed.
      swallow = true;
      window.setTimeout(() => { swallow = false; }, MS.base);
    };
    const leave = (event: PointerEvent) => { if (event.pointerType === 'mouse') hide(); };
    // While the glass is up, the finger holds it: no scroll, no menu, and the
    // lift that ends it is not a press on the photograph.
    const still = (event: Event) => { if (up) event.preventDefault(); };
    const menu = (event: Event) => { if (up || hold) event.preventDefault(); };
    const click = (event: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const resize = () => { if (up) measure(); };

    plate.addEventListener('pointerdown', down);
    plate.addEventListener('pointermove', move);
    plate.addEventListener('pointerup', lifted);
    plate.addEventListener('pointercancel', lifted);
    plate.addEventListener('pointerleave', leave);
    plate.addEventListener('touchmove', still, { passive: false });
    plate.addEventListener('contextmenu', menu);
    plate.addEventListener('click', click, true);
    window.addEventListener('resize', resize);
    return () => {
      window.clearTimeout(hold);
      cancelAnimationFrame(frame);
      plate.removeEventListener('pointerdown', down);
      plate.removeEventListener('pointermove', move);
      plate.removeEventListener('pointerup', lifted);
      plate.removeEventListener('pointercancel', lifted);
      plate.removeEventListener('pointerleave', leave);
      plate.removeEventListener('touchmove', still);
      plate.removeEventListener('contextmenu', menu);
      plate.removeEventListener('click', click, true);
      window.removeEventListener('resize', resize);
      delete plate.dataset.loupe;
    };
  }, [src, width, naturalWidth, naturalHeight]);

  return (
    <div
      ref={glass}
      aria-hidden="true"
      className="loupe-lens"
      style={{
        width: SIZE,
        height: SIZE,
        ['--lens-rim' as string]: withAlpha(LENS.light, 0.95),
        ['--lens-light' as string]: withAlpha(LENS.light, 0.45),
        ['--lens-shade' as string]: withAlpha(LENS.shade, 0.38),
        ['--lens-shade-soft' as string]: withAlpha(LENS.shade, 0.07),
        ['--lens-ink' as string]: withAlpha(LENS.shade, 0.92),
        ['--lens-warm' as string]: withAlpha(LENS.fringeWarm, 0.32),
        ['--lens-cool' as string]: withAlpha(LENS.fringeCool, 0.28),
      }}
    >
      <span ref={power} className="loupe-power latin" />
    </div>
  );
}
