'use client';

import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type { Locale } from '@diyar/i18n';
import { MS, prefersStill } from '@/features/motion/motion';
import { readKit, type RevealKit } from './kit';
import { isPlainPress, leadsToPerfume } from './press';
import type { Landing } from './RevealStage';
import { loadedStage, loadStage, type StageComponent } from './stage-loader';
import { canRenderBottle } from './support';
import { rememberRevealed, revealedThisVisit } from './visit';

/** How long the room waits, once the perfume's address is showing, for its page to say where the bottle lands. */
const LANDING_WAIT = MS.mist;
/** And for the page at all, before the room lifts over whatever is there. */
const GIVE_UP = 15_000;

let capable: boolean | null = null;
/** Asked once, and only when first needed: finding out creates a WebGL context. */
const isCapable = (): boolean => (capable ??= canRenderBottle());

interface Arrival {
  readonly kit: RevealKit;
  /** The card's photograph frame: where the reveal starts. */
  readonly frame: HTMLElement;
  readonly landing: Landing | null;
}

export interface RevealArrivals {
  /**
   * A perfume's page offers where the bottle lands and what the perfume says.
   * Taken only by a reveal on its way to that perfume, and only once.
   */
  offer(productId: string, landing: Landing): void;
}

const ArrivalsContext = createContext<RevealArrivals | null>(null);

/** For a perfume's page: where to offer its landing. Null outside the director. */
export const useRevealArrivals = (): RevealArrivals | null => useContext(ArrivalsContext);

/**
 * LE DÉVOILEMENT AS THE WAY IN (founder, 20 Oct 2026). The first time a
 * perfume is opened in a visit — from a card, anywhere in the shop — its reveal
 * plays as the passage to its page: the card's photograph lifts into a dark
 * room, the bottle stands up out of it and its notes rise, then it lies down
 * into the photograph at the top of the perfume's page. Any press, any key,
 * goes straight there.
 *
 * Pattern — MEDIATOR, with event delegation (ENGINEERING_PRINCIPLES §4). Two
 * parties take part and neither knows the other: the CARD knows where the
 * perfume starts — its photograph on this page and its relief (`kit.ts`) — and
 * the perfume's PAGE knows where it lands and what it says — the photograph at
 * its top, its house and its notes (`RevealTrigger` offers them). The director
 * sits between them in the root layout, the one thing that outlives the change
 * of page: it takes the press, keeps the stage up while the page changes behind
 * it, and hands the stage its landing when the page arrives. One listener for
 * every card, so a card stays a server-rendered link with no script of its own.
 *
 * The card is left an ordinary link — the press is not taken — for a new tab
 * or window (a modifier or the middle button), a perfume already revealed this
 * visit (`visit.ts`), a visitor who asked for less motion, a browser that
 * cannot draw the bottle, a photograph not yet loaded, and a card with no
 * relief behind it (no kit is written).
 */
export function RevealDirector({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [Stage, setStage] = useState<StageComponent | null>(null);
  // Set in the press itself, not after a render: a second press in the same frame finds it taken.
  const busy = useRef(false);
  const pushed = useRef(false);

  useEffect(() => {
    const begin = (kit: RevealKit, frame: HTMLElement) => {
      busy.current = true;
      pushed.current = false;
      rememberRevealed(kit.id);
      setDismissed(false);
      setArrival({ kit, frame, landing: null });
      const ready = loadedStage();
      if (ready) { setStage(() => ready); return; }
      loadStage().then((stage) => setStage(() => stage), () => {
        // Its code could not be fetched (a lost connection): the card is a link after all.
        busy.current = false;
        setArrival(null);
        router.push(kit.href as Route);
      });
    };
    const onPress = (e: MouseEvent) => {
      if (busy.current || !isPlainPress(e)) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const card = anchor.closest<HTMLElement>('[data-reveal-card]');
      const kit = readKit(card?.dataset.revealCard);
      const frame = card?.querySelector<HTMLElement>('[data-reveal-frame]');
      const img = frame?.querySelector('img');
      // The photograph is what lifts: one still loading would fly as an empty frame.
      if (!kit || !frame || !img || !img.complete || img.naturalWidth === 0) return;
      if (!leadsToPerfume(anchor.href, kit.href, window.location.href)) return;
      if (prefersStill() || revealedThisVisit(kit.id) || !isCapable()) return;
      // Ours from here: the link does not navigate — the reveal does, once it has begun.
      e.preventDefault();
      begin(kit, frame);
    };
    // Capturing, on the window: before the link's own handler and the route loader's, which see it taken.
    window.addEventListener('click', onPress, true);
    return () => window.removeEventListener('click', onPress, true);
  }, [router]);

  // A page with cards the reveal could start from: its code is fetched while the visitor reads, so a press answers at once.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (document.querySelector('[data-reveal-card]') && !prefersStill() && isCapable()) void loadStage();
    }, MS.ceremony);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const active = arrival !== null;
  const landed = arrival !== null && arrival.landing !== null;
  const target = arrival ? new URL(arrival.kit.href, window.location.href).pathname : null;

  // Back, or forward, while on the way: that visitor is going somewhere else.
  useEffect(() => {
    if (!active) return undefined;
    const onPop = () => setDismissed(true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);

  // The room never waits in the dark for a page that is not coming: one that never arrived (a failed request, a
  // lost connection), or one whose address is showing but which has not said where to land (an error page, or a
  // perfume whose relief was removed meanwhile).
  useEffect(() => {
    if (!active || landed) return undefined;
    const timer = window.setTimeout(() => setDismissed(true), pathname === target ? LANDING_WAIT : GIVE_UP);
    return () => window.clearTimeout(timer);
  }, [active, landed, pathname, target]);

  const offer = useCallback((productId: string, landing: Landing) => {
    setArrival((now) => (now && now.kit.id === productId && !now.landing ? { ...now, landing } : now));
  }, []);
  const arrivals = useMemo<RevealArrivals>(() => ({ offer }), [offer]);

  const started = useCallback(() => {
    if (pushed.current || !arrival) return;
    pushed.current = true;
    // The card's own link, written on the server by `localeHref` — a route of this app.
    router.push(arrival.kit.href as Route);
  }, [arrival, router]);

  const closed = useCallback(() => {
    busy.current = false;
    setArrival(null);
    setDismissed(false);
  }, []);

  return (
    <ArrivalsContext.Provider value={arrivals}>
      {children}
      {arrival && Stage && (
        <Stage
          mode="arrival"
          kit={arrival.kit}
          frame={arrival.frame}
          landing={arrival.landing}
          dismissed={dismissed}
          locale={locale}
          onStarted={started}
          onClosed={closed}
        />
      )}
    </ArrivalsContext.Provider>
  );
}
