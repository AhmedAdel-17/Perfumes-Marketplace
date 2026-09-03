'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Entrance motion.
 *
 * DESIGN_DOCTRINE.md law VI: motion has weight. Things settle; they never pop.
 * The practical difference between a luxury surface and a fast one is that on
 * the luxury surface content ARRIVES — it does not simply exist the instant the
 * bytes land. A 700ms rise of twelve pixels on a decelerating curve is the
 * whole effect; anything more energetic than that reads as a consumer app.
 *
 * Three rules this enforces, all of which are usually got wrong:
 *
 *   1. It reveals ONCE and then disconnects. Elements that re-animate every
 *      time they re-enter the viewport turn scrolling into a slideshow.
 *   2. It never hides content that will not be revealed. If IntersectionObserver
 *      is unavailable, or JavaScript never runs, the initial state is visible —
 *      the opposite bet (start at opacity 0, hope the script arrives) is how
 *      pages ship blank.
 *   3. `prefers-reduced-motion` is honoured by not animating AT ALL, rather than
 *      by animating faster. The CSS in globals.css collapses durations, but a
 *      12px translate would still fire; this checks the query directly.
 *
 * Pattern — a headless behaviour component: it owns the timing and none of the
 * appearance, so a section decides how it looks and this decides when.
 */
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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    // Already on screen at mount (above the fold) — reveal without waiting for
    // a scroll that may never happen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Fire slightly before the element reaches the fold, so the motion is
      // finishing as it becomes properly visible rather than starting then.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`${className} motion-safe:transition-[opacity,transform] motion-safe:duration-slow motion-safe:ease-out ${
        shown ? 'opacity-100 translate-y-0' : 'motion-safe:opacity-0 motion-safe:translate-y-3'
      }`}
      style={shown ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
