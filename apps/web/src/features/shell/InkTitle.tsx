'use client';

import { useEffect, useRef } from 'react';
import { prefersStill } from '@/features/motion/motion';
import { inkMask, type InkDirection } from './ink-mask';

/**
 * A section's title, written in ink the first time it comes into view
 * (L'Encre — Les Détails, founder 19 Oct 2026; `ink-mask.ts` says how).
 *
 * The order of states is `Reveal`'s, and for the same reason: the server
 * renders the title PLAIN, and only a title that is still below the fold once
 * the page is running is hidden — then written as it arrives. No JavaScript,
 * reduced motion, print, a title already on screen: all simply show the words.
 * After the ink has dried the mask is taken away, so nothing lingers on a
 * heading that is resized or selected.
 *
 * Arabic is never letterspaced or reshaped here: the mask lies over the words
 * as they are set, so every join stays whole.
 */
export function InkTitle({ id, className, children }: { id?: string | undefined; className: string; children: string }) {
  const line = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = line.current;
    if (!el || prefersStill() || typeof IntersectionObserver === 'undefined') return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return; // already seen: never hidden, never rewritten

    let url = '', live = true;
    let seen: IntersectionObserver | null = null;
    const done = () => {
      delete el.dataset.ink;
      el.style.removeProperty('--ink-mask');
      if (url) URL.revokeObjectURL(url);
    };
    const arm = async () => {
      await document.fonts.ready;
      if (!live) return;
      const direction: InkDirection = getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
      const mask = inkMask(el.offsetWidth, el.offsetHeight, direction);
      const canvas = document.createElement('canvas');
      canvas.width = mask.width;
      canvas.height = mask.height;
      const g = canvas.getContext('2d');
      if (!g) return;
      const image = g.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.alpha.length; i++) image.data[i * 4 + 3] = mask.alpha[i]!;
      g.putImageData(image, 0, 0);
      for (const blot of mask.blots) {
        const drop = g.createRadialGradient(blot.x, blot.y, 0, blot.x, blot.y, blot.r);
        drop.addColorStop(0, 'black');
        drop.addColorStop(1, 'transparent');
        g.fillStyle = drop;
        g.beginPath();
        g.arc(blot.x, blot.y, blot.r, 0, Math.PI * 2);
        g.fill();
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob || !live) return;
      url = URL.createObjectURL(blob);
      el.style.setProperty('--ink-mask', `url("${url}")`);
      el.dataset.inkDir = direction;
      el.dataset.ink = 'armed';
      seen = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen?.disconnect();
        el.dataset.ink = 'writing';
      }, { threshold: 0.6 });
      seen.observe(el);
    };
    el.addEventListener('animationend', done);
    void arm();
    return () => {
      live = false;
      seen?.disconnect();
      el.removeEventListener('animationend', done);
      done();
    };
  }, [children]);

  return (
    <h2 id={id} className={className}>
      <span ref={line} className="ink-line">{children}</span>
    </h2>
  );
}
