'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { NoteIcon } from '@diyar/domain';
import { glassPalette } from '@diyar/tokens';
import { CURRENCY_LABEL, formatPrice, langAttrs, pick, PRODUCT, type Locale } from '@diyar/i18n';
import type { StorefrontRelief } from '@/core/catalogue';
import { AddToBag } from '@/features/cart/AddToBag';
import { NoteIconMark } from '@/features/catalogue/NoteChip';
import { recordBrowsing } from '@/features/analytics/record';
import { primarySurface } from '@/features/shell/primary-surface';
import { RevealController, TIERS, type Chip, type Tier } from './stage-controller';

export interface RevealProduct {
  readonly id: string;
  readonly name: { readonly text: string; readonly lang: 'ar' | 'en' };
  readonly house: { readonly text: string; readonly lang: 'ar' | 'en' };
  readonly brandLatin: string;
  readonly family: string;
  readonly pricePiastres: number;
  readonly inStock: boolean;
  readonly notes: Readonly<Record<Tier, readonly string[]>>;
  /** English names from the glossary, keyed by the Arabic note. */
  readonly english: Readonly<Record<string, string>>;
  readonly icons: Readonly<Record<string, NoteIcon>>;
}

const TIER_NAME = { top: 'topNotes', heart: 'heartNotes', base: 'baseNotes' } as const;
const TIER_LATIN = { top: 'TOP', heart: 'HEART', base: 'BASE' } as const;

/**
 * The reveal's stage: the room the bottle is lifted into (Le Dévoilement).
 *
 * A dialog in a portal, scoped to the dark theme whatever the page's — opening
 * a perfume dims the room — and laid out once; `RevealController` moves it.
 * Loaded only when a visitor presses the control (`RevealTrigger`), so the
 * product page carries none of it until then.
 *
 * Accessible as a dialog: labelled by the perfume's name, focus moved to the
 * close button once the bottle stands and kept inside, Escape closes, and
 * focus returns to the control. The notes are a real list, tier by tier, so a
 * screen reader hears what the orbit shows. Reduced motion: the bottle simply
 * stands with its notes around it — no flight, no orbit, no mist.
 */
export function RevealStage({
  frame, relief, photo, product, locale, onClosed,
}: {
  /** The photograph's frame on the page. */
  frame: HTMLElement;
  relief: StorefrontRelief;
  photo: { readonly width: number; readonly height: number };
  product: RevealProduct;
  locale: Locale;
  onClosed: () => void;
}): ReactElement {
  const copy = PRODUCT[locale];
  const root = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLCanvasElement>(null);
  const mist = useRef<HTMLCanvasElement>(null);
  const plinth = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const chipEls = useRef<Array<HTMLLIElement | null>>([]);
  const guideEls = useRef<Partial<Record<Tier, HTMLSpanElement | null>>>({});
  const controller = useRef<RevealController | null>(null);
  const [standing, setStanding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [touch] = useState(() => window.matchMedia('(hover: none)').matches);

  const chips = useMemo(() => TIERS.flatMap((tier) => product.notes[tier].map((note, index, list) => {
    const shown = pick(locale, note, product.english[note]);
    return {
      key: `${tier}-${note}`, tier, index, count: list.length, note, shown,
      // On the Arabic site the glossary's English name is printed small beside it, as on the label.
      latin: locale === 'ar' ? product.english[note] ?? null : null,
      icon: product.icons[note] ?? null,
    };
  })), [product, locale]);

  useEffect(() => {
    const html = document.documentElement;
    const scroll = html.style.overflow;
    html.style.overflow = 'hidden';
    // The page behind the room is out of reach while it is open: not only for
    // the Tab key (the trap below) but for a screen reader, and for anything
    // that focuses an element directly. That is what aria-modal promises.
    const behind = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root.current && !el.hasAttribute('inert'),
    );
    for (const el of behind) el.setAttribute('inert', '');
    const release = () => { for (const el of behind) el.removeAttribute('inert'); };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let c: RevealController;
    try {
      c = new RevealController({
      root: root.current!,
      glass: glass.current!,
      mist: mist.current!,
      plinth: plinth.current!,
      panel: panel.current!,
      hint: hint.current,
      frame,
      chips: chips
        .map((chip, i): Chip | null => {
          const el = chipEls.current[i];
          return el ? { el, tier: chip.tier, index: chip.index, count: chip.count } : null;
        })
        .filter((chip): chip is Chip => chip !== null),
      guides: Object.fromEntries(TIERS.map((tier) => [tier, guideEls.current[tier] ?? undefined])),
    }, {
      cutoutUrl: relief.cutoutUrl,
      reliefUrl: relief.reliefUrl,
      placement: relief.placement,
      photo,
      mistColour: glassPalette(product.family).mist,
      still,
      onStanding: () => setStanding(true),
      onLeaving: () => setLeaving(true),
      onClosed,
    });
    } catch (error) {
      // A browser that cannot draw it after all: the page stays exactly as it was.
      console.warn('The reveal could not start; the page is left as it was.', error);
      html.style.overflow = scroll;
      release();
      onClosed();
      return undefined;
    }
    controller.current = c;
    void c.open();
    // Not awaited and never throws: the reveal does not wait on a count being written.
    void recordBrowsing('reveal_open', { productId: product.id });
    return () => {
      c.destroy();
      html.style.overflow = scroll;
      release();
    };
    // Mounted once per opening; everything it reads is fixed for that opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (standing && !leaving) close.current?.focus({ preventScroll: true });
  }, [standing, leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); void controller.current?.close(); return; }
      if (e.key !== 'Tab' || !root.current) return;
      // Focus stays inside the dialog while it is open.
      const focusable = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
      if (focusable.length === 0) return;
      const first = focusable[0]!, last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const move = (e: React.PointerEvent, active: boolean) => controller.current?.pointerMove(e.clientX, e.clientY, active);

  return createPortal(
    <div
      ref={root}
      data-theme="dark"
      role="dialog"
      aria-modal="true"
      aria-label={copy.revealLabel(product.name.text)}
      className={['reveal', standing && !leaving ? 'is-revealed' : ''].join(' ')}
      // The family's colour as light, for the notes' drawings — derived from its token.
      style={{ '--reveal-mist': glassPalette(product.family).mist } as React.CSSProperties}
    >
      <div className="reveal-veil" aria-hidden="true" />
      <div
        className="reveal-scene"
        onPointerMove={(e) => move(e, e.pointerType === 'mouse' || e.buttons > 0)}
        onPointerDown={(e) => move(e, true)}
        onPointerUp={(e) => move(e, e.pointerType === 'mouse')}
        onPointerLeave={(e) => move(e, false)}
      >
        <div ref={plinth} className="reveal-plinth" aria-hidden="true" />
        <canvas ref={mist} className="reveal-mist" aria-hidden="true" />
        <canvas ref={glass} className="reveal-glass" aria-hidden="true" />
        <ul className="reveal-notes" aria-label={copy.notesTitle}>
          {chips.map((chip, i) => (
            <li key={chip.key} ref={(el) => { chipEls.current[i] = el; }} className={`reveal-chip reveal-chip-${chip.tier}`}>
              <NoteIconMark icon={chip.icon} className="reveal-chip-icon" />
              <span {...langAttrs(locale, chip.shown.lang)}>{chip.shown.text}</span>
              {chip.latin && <span className="latin reveal-chip-latin" lang="en">{chip.latin}</span>}
              <span className="sr-only">{` — ${copy[TIER_NAME[chip.tier]]}`}</span>
            </li>
          ))}
        </ul>
        {TIERS.map((tier) => (
          <span key={tier} ref={(el) => { guideEls.current[tier] = el; }} className="reveal-guide" aria-hidden="true">
            <span className="latin">{TIER_LATIN[tier]}</span>
            <span>{copy[TIER_NAME[tier]]}</span>
          </span>
        ))}
        <span ref={hint} className="reveal-hint" aria-hidden="true">{touch ? copy.revealLightTouch : copy.revealLight}</span>
      </div>

      <aside ref={panel} className="reveal-panel">
        <span className="reveal-kicker latin">{product.brandLatin}</span>
        <h2 {...langAttrs(locale, product.name.lang)} className="font-display text-h2 leading-heading lg:text-h1">{product.name.text}</h2>
        <p {...langAttrs(locale, product.house.lang)} className="text-body text-ink2">{product.house.text}</p>
        <div className="flex items-baseline gap-2">
          <span className="tnum text-h3">{formatPrice(product.pricePiastres)}</span>
          <span className="latin text-caption tracking-label text-ink2">{CURRENCY_LABEL}</span>
        </div>
        <AddToBag
          productId={product.id}
          pricePiastres={product.pricePiastres}
          inStock={product.inStock}
          className={`${primarySurface} w-full`}
        />
        <p className="text-small text-ink3">{copy.revealFrom}</p>
      </aside>

      <button
        ref={close}
        type="button"
        className="reveal-close"
        aria-label={copy.close}
        onClick={() => void controller.current?.close()}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>,
    document.body,
  );
}
