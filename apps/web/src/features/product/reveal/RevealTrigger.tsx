'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { PRODUCT, type Locale } from '@diyar/i18n';
import type { StorefrontRelief } from '@/core/catalogue';
import { canRenderBottle } from './support';
import type { RevealProduct } from './RevealStage';

/**
 * Loaded when pressed, never before: the stage, its renderer and its mist are
 * the reveal's whole weight, and a visitor who only reads the page should not
 * download any of it (CLAUDE.md §14: check bundle impact).
 */
const RevealStage = dynamic(() => import('./RevealStage').then((m) => m.RevealStage), { ssr: false });

/**
 * The control that opens a perfume's reveal (Le Dévoilement, founder 19 Oct
 * 2026: the product page only, first).
 *
 * The whole photograph is the control — a bottle invites the hand — with its
 * name printed in a corner, so it reads as something to press and a screen
 * reader hears what it does. Shown only when this browser can draw the bottle:
 * a control that opened nothing would be worse than none.
 */
export function RevealTrigger({ relief, photo, product, locale }: {
  relief: StorefrontRelief;
  photo: { readonly width: number; readonly height: number };
  product: RevealProduct;
  locale: Locale;
}) {
  const copy = PRODUCT[locale];
  const button = useRef<HTMLButtonElement>(null);
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const returning = useRef(false);

  useEffect(() => { setSupported(canRenderBottle()); }, []);

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
          setFrame(button.current?.parentElement ?? null);
          setOpen(true);
        }}
      >
        <span className="reveal-trigger-label">{copy.reveal}</span>
      </button>
      {open && frame && (
        <RevealStage
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
