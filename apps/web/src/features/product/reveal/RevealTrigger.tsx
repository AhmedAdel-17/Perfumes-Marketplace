'use client';

import { useEffect, useRef, useState } from 'react';
import { PRODUCT, type Locale } from '@diyar/i18n';
import type { StorefrontRelief } from '@/core/catalogue';
import { useRevealArrivals } from './RevealDirector';
import type { RevealProduct } from './RevealStage';
import { loadedStage, loadStage, type StageComponent } from './stage-loader';
import { canRenderBottle } from './support';
import { rememberRevealed } from './visit';

/**
 * The control that opens a perfume's reveal on its own page (Le Dévoilement,
 * founder 19 Oct 2026) — and, since 20 Oct, the place a reveal that started
 * on a CARD lands: this page offers the director its photograph and its words
 * (`useRevealArrivals`), and the bottle lies down here. The control stays for a
 * visitor who came straight to the page, and for a second look.
 *
 * The whole photograph is the control — a bottle invites the hand — with its
 * name printed in a corner, so it reads as something to press and a screen
 * reader hears what it does. Shown only when this browser can draw the bottle:
 * a control that opened nothing would be worse than none.
 *
 * The stage is fetched when pressed, never before (`stage-loader`): it is the
 * reveal's whole weight, and a visitor who only reads the page should not
 * download any of it (CLAUDE.md §14: check bundle impact).
 */
export function RevealTrigger({ relief, photo, product, locale }: {
  relief: StorefrontRelief;
  photo: { readonly width: number; readonly height: number };
  product: RevealProduct;
  locale: Locale;
}) {
  const copy = PRODUCT[locale];
  const button = useRef<HTMLButtonElement>(null);
  const arrivals = useRevealArrivals();
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const [Stage, setStage] = useState<StageComponent | null>(null);
  const returning = useRef(false);

  useEffect(() => { setSupported(canRenderBottle()); }, []);

  // A reveal on its way here from a card lands in this photograph, and names the perfume with these words.
  useEffect(() => {
    const plate = button.current?.parentElement;
    if (supported && plate) arrivals?.offer(product.id, { frame: plate, product });
  }, [supported, arrivals, product]);

  /*
   * Focus goes back to this control once the room has GONE, not when it says
   * it is closing. While the stage is mounted the page behind it is `inert`,
   * and a browser ignores focus() on an inert element — so focusing in the
   * close callback left focus on the body, and the browser suite caught it
   * (20 Oct 2026). The stage's own clean-up releases the page before this
   * effect runs: React runs every unmount's clean-up before new effects.
   */
  useEffect(() => {
    if (open || !returning.current) return;
    returning.current = false;
    button.current?.focus({ preventScroll: true });
  }, [open]);
  if (!supported) return null;

  return (
    <>
      <button
        ref={button}
        type="button"
        className="reveal-trigger group"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const plate = button.current?.parentElement ?? null;
          const show = (stage: StageComponent) => {
            // Seen now: a card leading here later in the visit opens the page as a plain link.
            rememberRevealed(product.id);
            setStage(() => stage);
            setFrame(plate);
            setOpen(true);
          };
          const ready = loadedStage();
          if (ready) show(ready);
          // A stage that could not be fetched opens nothing; the page is as it was.
          else loadStage().then(show, () => undefined);
        }}
      >
        <span className="reveal-trigger-label">{copy.reveal}</span>
      </button>
      {open && frame && Stage && (
        <Stage
          mode="open"
          frame={frame}
          relief={relief}
          photo={photo}
          product={product}
          locale={locale}
          onClosed={() => {
            returning.current = true;
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
