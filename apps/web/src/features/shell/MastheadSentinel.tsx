'use client';

import { useEffect, useRef } from 'react';
import { motion } from '@diyar/tokens';

/**
 * Tells the masthead when the page has scrolled under it.
 *
 * A zero-height marker placed just above the sticky bar. While it is on screen
 * the bar sits in its full, airy form; once it scrolls out, `data-scrolled`
 * goes on <html> and the bar settles into a slimmer one (SiteHeader) — more
 * of the catalogue on screen while browsing, the full masthead back at the top.
 *
 * An IntersectionObserver, not a scroll listener: the browser reports the one
 * moment that matters, and nothing runs per frame while the visitor scrolls.
 * Without JavaScript the attribute never appears and the bar simply stays full.
 *
 * It also marks the visit's FIRST ARRIVAL as done (`data-arrived`), once the
 * wordmark's mist has played: the masthead remounts on every navigation, and
 * the ceremony belongs to arriving at the house, not to every page in it.
 */
const SCROLLED = 'data-scrolled';
const ARRIVED = 'data-arrived';

export function MastheadSentinel() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) root.removeAttribute(SCROLLED);
      else root.setAttribute(SCROLLED, '');
    });
    observer.observe(node);
    const arrival = window.setTimeout(() => root.setAttribute(ARRIVED, ''), motion.mist);
    return () => {
      window.clearTimeout(arrival);
      observer.disconnect();
      root.removeAttribute(SCROLLED);
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="h-0" />;
}
