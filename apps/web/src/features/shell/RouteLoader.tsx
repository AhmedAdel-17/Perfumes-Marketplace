'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from '@diyar/tokens';
import { FlaconLoader } from './FlaconLoader';
import { RouteWait, type WaitPhase } from './route-wait';

/**
 * The page-sized loader: the large flacon over the screen while the next page
 * is on its way, and its spritz when it arrives (founder, 17 Oct 2026).
 *
 * The timing — never a flash, a minimum time on screen, a spritz, a give-up —
 * is RouteWait's, a state machine tested on a fake clock. This component only
 * feeds it the two signals the App Router offers: a click on a link to another
 * page (or back/forward) starts a wait, and the pathname or query changing
 * ends it. The App Router has no navigation events, so the click is the
 * earliest honest signal; the old page stays on screen underneath, which is
 * better than any blank.
 *
 * Not caught, on purpose: a full page load (the language switch fades the
 * page out itself — LeaveLink, `data-full-load`), a new tab, a download, a
 * link to the page you are on, and in-page anchors.
 */
const TIMINGS = { appearAfter: motion.base!, hold: motion.slow!, giveUp: 15_000 };

function leadsElsewhere(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download') || anchor.hasAttribute('data-full-load')) return false;
  const next = new URL(anchor.href, window.location.href);
  if (next.origin !== window.location.origin) return false;
  return next.pathname !== window.location.pathname || next.search !== window.location.search;
}

export function RouteLoader({ label, caption }: { label: string; caption: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [phase, setPhase] = useState<WaitPhase>('idle');
  const wait = useRef<RouteWait | null>(null);
  const first = useRef(true);
  // The address of the page on screen, as the router last rendered it.
  const shown = useRef('');

  useEffect(() => {
    const machine = new RouteWait(TIMINGS, {
      now: () => performance.now(),
      set: (fn, ms) => window.setTimeout(fn, ms),
      clear: (handle) => window.clearTimeout(handle),
    }, setPhase);
    wait.current = machine;
    const onClick = (event: MouseEvent) => { if (leadsElsewhere(event)) machine.start(); };
    /*
     * Back and forward: wait only for a page that is not yet on screen. The
     * router often restores the previous page from its cache before this
     * listener hears the `popstate` — and a wait started for a page already
     * shown has nothing left to end it, so the veil stood over the page,
     * catching every press, until it gave up fifteen seconds later (found
     * 20 Oct 2026, pressing Back after a perfume's page).
     */
    const onPop = () => {
      // The query written as the router writes it, so the two compare equal.
      const query = new URLSearchParams(window.location.search).toString();
      if (window.location.pathname + (query ? `?${query}` : '') !== shown.current) machine.start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
      machine.dispose();
    };
  }, []);

  // The new page is the page: the wait is over.
  useEffect(() => {
    shown.current = pathname + (query ? `?${query}` : '');
    if (first.current) { first.current = false; return; }
    wait.current?.finish();
  }, [pathname, query]);

  if (phase === 'idle' || phase === 'waiting') return null;

  return (
    <div
      role="status"
      aria-label={label}
      className={[
        'fixed inset-0 z-[45] grid place-items-center bg-ground/[.92]',
        // Leaving, it no longer blocks the page: the new page is usable as the veil lifts.
        phase === 'done' ? 'route-loader-leaving pointer-events-none' : 'route-loader-arriving',
      ].join(' ')}
    >
      <div className="flex flex-col items-center gap-4">
        <FlaconLoader size="lg" done={phase === 'done'} />
        <p className="text-body text-ink3">{caption}</p>
      </div>
    </div>
  );
}
