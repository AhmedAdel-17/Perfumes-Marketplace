'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Entrance motion.
 *
 * DESIGN_DOCTRINE.md law VI: motion has weight. Things settle; they never pop.
 * The practical difference between a luxury surface and a fast one is that on
 * the luxury surface content ARRIVES — it does not simply exist the instant the
 * bytes land. A 700ms rise of twelve pixels on a decelerating curve is the
 * whole effect; anything more energetic reads as a consumer app.
 *
 * THE ORDER OF STATES IS THE WHOLE DESIGN, and the first version got it exactly
 * backwards. It rendered hidden and waited for JavaScript to reveal — so the
 * server-rendered HTML carried `opacity: 0` on everything below the fold, and
 * anything that does not scroll saw a blank page: a full-page screenshot, a
 * print, a reader mode, a crawler that renders but does not scroll. The whole
 * product grid was invisible in a screenshot of the home page, which is how it
 * was found.
 *
 * The comment above that code correctly warned against precisely this bet. A
 * rule stated in a comment and contradicted by the code beneath it is worse
 * than no rule, because it stops the next reader from checking.
 *
 * So: RENDER VISIBLE, then hide only what is genuinely below the fold, and only
 * once JavaScript is running and IntersectionObserver exists to bring it back.
 *
 *   - No JavaScript      → visible. Nothing can strand it.
 *   - Reduced motion     → visible, immediately, no transition at all.
 *   - Above the fold     → visible; it was already on screen, so animating it
 *                          in is a flash rather than an arrival.
 *   - Below the fold     → hidden after mount, revealed on approach, and the
 *                          observer disconnects so scrolling never becomes a
 *                          slideshow.
 *
 * The hide-after-mount cannot flash, because by definition it only applies to
 * elements the viewer cannot currently see.
 */
type Phase = 'visible' | 'armed';

export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
}: {
  children: React.ReactNode;
  /** Stagger, in milliseconds. Keep the whole sequence under ~400ms of offset. */
  delay?: number;
  as?: 'div' | 'section' | 'li';
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // Visible is the SSR state and the state every non-scrolling reader sees.
  const [phase, setPhase] = useState<Phase>('visible');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    // Already on screen: leave it alone. Fading in something the viewer is
    // already looking at is a flicker, not an entrance.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight) return;

    setPhase('armed');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPhase('visible');
            observer.disconnect();
          }
        }
      },
      // Slightly before the fold, so the motion finishes as the element becomes
      // properly visible rather than starting then.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`${className} motion-safe:transition-[opacity,transform] motion-safe:duration-slow motion-safe:ease-out ${
        phase === 'armed' ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'
      }`}
      style={phase === 'visible' ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
