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
import type { RevealKit } from './kit';
import { keyGoesOnward } from './press';
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

/** What a perfume's page brings when it arrives behind the room: where the bottle lies down, and what it says. */
export interface Landing {
  /** The photograph's frame at the top of the page. */
  readonly frame: HTMLElement;
  readonly product: RevealProduct;
}

/** Opened from the control on the perfume's page: a dialog, closed by the visitor. */
interface InPlace {
  readonly mode: 'open';
  readonly relief: StorefrontRelief;
  readonly photo: { readonly width: number; readonly height: number };
  readonly product: RevealProduct;
}

/** The way into the perfume's page from a card: it ends by itself, and any press goes straight there. */
interface OnTheWay {
  readonly mode: 'arrival';
  readonly kit: RevealKit;
  /** Null until the page has arrived behind the room. */
  readonly landing: Landing | null;
  /** The page is not coming (the visitor went back, or it failed): the room lifts over whatever is there. */
  readonly dismissed: boolean;
  /** The reveal has begun: the page may be asked for now. */
  readonly onStarted: () => void;
}

export type RevealStageProps = (InPlace | OnTheWay) & {
  /** The photograph's frame the bottle is lifted from. */
  readonly frame: HTMLElement;
  readonly locale: Locale;
  readonly onClosed: () => void;
};

const TIER_NAME = { top: 'topNotes', heart: 'heartNotes', base: 'baseNotes' } as const;
const TIER_LATIN = { top: 'TOP', heart: 'HEART', base: 'BASE' } as const;

/**
 * The page behind the room, out of reach while it is up: not only for the Tab
 * key (the trap below) but for a screen reader, and for anything that focuses
 * an element directly — what aria-modal promises. Sealed AGAIN when a new page
 * arrives behind it (the reveal as the way in): its elements are new.
 */
class PageSeal {
  private readonly sealed: HTMLElement[] = [];

  constructor(private readonly room: HTMLElement) {}

  seal(): void {
    for (const el of document.body.children) {
      if (el instanceof HTMLElement && el !== this.room && !el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        this.sealed.push(el);
      }
    }
  }

  release(): void {
    for (const el of this.sealed) el.removeAttribute('inert');
    this.sealed.length = 0;
  }
}

/**
 * The reveal's stage: the room the bottle is lifted into (Le Dévoilement).
 *
 * A dialog in a portal, scoped to the dark theme whatever the page's — opening
 * a perfume dims the room — and laid out once; `RevealController` moves it.
 * Loaded only when it is wanted (`RevealTrigger`, `RevealDirector`), so a page
 * carries none of it until then.
 *
 * Two ways in. IN PLACE, from the control on the perfume's page: it stands
 * until the visitor closes it, with the perfume's price and its bag. ON THE
 * WAY, from a card (founder, 20 Oct 2026): the room is the passage to the
 * perfume's page, its panel only names the perfume, and it ends by itself —
 * any press, any key, goes straight on. The house and the notes come with the
 * page (`landing`); the card brought only what the start needs.
 *
 * Accessible as a dialog: labelled by the perfume's name, focus kept inside
 * and moved to its one button — the close, once the bottle stands; on the
 * way, at once, as "continue". The notes are a real list, tier by tier, so a
 * screen reader hears what the orbit shows. Reduced motion: the bottle simply
 * stands with its notes around it — no flight, no orbit, no mist — and the
 * way in from a card is not played at all (`RevealDirector`).
 */
export function RevealStage(props: RevealStageProps): ReactElement {
  const { frame, locale, onClosed } = props;
  const arriving = props.mode === 'arrival';
  const copy = PRODUCT[locale];
  // What the start needs: from the card on the way in, from the page in place. Read once, at mount.
  const start = props.mode === 'open'
    ? { id: props.product.id, family: props.product.family, relief: props.relief, photo: props.photo }
    : { id: props.kit.id, family: props.kit.family, relief: props.kit.relief, photo: props.kit.photo };
  const id = start.id;
  // The perfume's words: at once in place; on the way, with its page.
  const words = props.mode === 'open' ? props.product : props.landing?.product ?? null;
  const name = props.mode === 'open' ? props.product.name : props.kit.name;
  const brandLatin = props.mode === 'open' ? props.product.brandLatin : props.kit.brandLatin;
  const landing = props.mode === 'arrival' ? props.landing : null;
  const dismissed = props.mode === 'arrival' && props.dismissed;

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
  const page = useRef<PageSeal | null>(null);
  const [standing, setStanding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [touch] = useState(() => window.matchMedia('(hover: none)').matches);

  const chips = useMemo(() => (words ? TIERS.flatMap((tier) => words.notes[tier].map((note, index, list) => {
    const shown = pick(locale, note, words.english[note]);
    return {
      key: `${tier}-${note}`, tier, index, count: list.length, note, shown,
      // On the Arabic site the glossary's English name is printed small beside it, as on the label.
      latin: locale === 'ar' ? words.english[note] ?? null : null,
      icon: words.icons[note] ?? null,
    };
  })) : []), [words, locale]);

  useEffect(() => {
    const html = document.documentElement;
    const scroll = html.style.overflow;
    html.style.overflow = 'hidden';
    const seal = new PageSeal(root.current!);
    seal.seal();
    page.current = seal;
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
        guides: Object.fromEntries(TIERS.map((tier) => [tier, guideEls.current[tier] ?? undefined])),
      }, {
        cutoutUrl: start.relief.cutoutUrl,
        reliefUrl: start.relief.reliefUrl,
        placement: start.relief.placement,
        photo: start.photo,
        mistColour: glassPalette(start.family).mist,
        still,
        onStanding: () => setStanding(true),
        onLeaving: () => setLeaving(true),
        onClosed,
      });
    } catch (error) {
      // A browser that cannot draw it after all: the page stays exactly as it
      // was — and a card that was pressed still opens its perfume, as a link would.
      console.warn('The reveal could not start; the page is left as it was.', error);
      html.style.overflow = scroll;
      seal.release();
      if (props.mode === 'arrival') props.onStarted();
      onClosed();
      return undefined;
    }
    controller.current = c;
    // Not awaited and never throws: the reveal does not wait on a count being written.
    if (props.mode === 'arrival') {
      void c.arrive();
      props.onStarted();
      void recordBrowsing('reveal_arrive', { productId: start.id });
    } else {
      void c.open();
      void recordBrowsing('reveal_open', { productId: start.id });
    }
    return () => {
      c.destroy();
      html.style.overflow = scroll;
      seal.release();
    };
    // Mounted once per opening; everything it reads is fixed for that opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The notes, once they are known and drawn: the controller moves them from here on.
  useEffect(() => {
    controller.current?.notes(chips
      .map((chip, i): Chip | null => {
        const el = chipEls.current[i];
        return el ? { el, tier: chip.tier, index: chip.index, count: chip.count } : null;
      })
      .filter((chip): chip is Chip => chip !== null));
  }, [chips]);

  // The page has arrived behind the room: out of reach as the old one was, and the bottle will lie down into it.
  useEffect(() => {
    if (!landing) return;
    page.current?.seal();
    controller.current?.home(landing.frame);
  }, [landing]);

  useEffect(() => {
    if (dismissed) controller.current?.dismiss();
  }, [dismissed]);

  // On the way, the way on is offered at once; in place, the close once the bottle stands.
  useEffect(() => {
    if (!leaving && (arriving || standing)) close.current?.focus({ preventScroll: true });
  }, [arriving, standing, leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && root.current) {
        // Focus stays inside the dialog while it is open.
        const focusable = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
        if (focusable.length === 0) return;
        const first = focusable[0]!, last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (arriving) {
        if (keyGoesOnward(e.key)) { e.preventDefault(); goOn(controller.current, id); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); void controller.current?.close(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [arriving, id]);

  const move = (e: React.PointerEvent, active: boolean) => controller.current?.pointerMove(e.clientX, e.clientY, active);
  const house = words?.house ?? null;

  return createPortal(
    <div
      ref={root}
      data-theme="dark"
      data-mode={props.mode}
      role="dialog"
      aria-modal="true"
      aria-label={copy.revealLabel(name.text)}
      className={['reveal', standing && !leaving ? 'is-revealed' : ''].join(' ')}
      // The family's colour as light, for the notes' drawings — derived from its token.
      style={{ '--reveal-mist': glassPalette(start.family).mist } as React.CSSProperties}
      // On the way, a press anywhere goes straight on — the moment the hand comes down.
      onPointerDown={arriving ? () => goOn(controller.current, id) : undefined}
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
        {!arriving && (
          <span ref={hint} className="reveal-hint" aria-hidden="true">{touch ? copy.revealLightTouch : copy.revealLight}</span>
        )}
      </div>

      <aside ref={panel} className="reveal-panel">
        <span className="reveal-kicker latin">{brandLatin}</span>
        <h2 {...langAttrs(locale, name.lang)} className="font-display text-h2 leading-heading lg:text-h1">{name.text}</h2>
        {house && <p {...langAttrs(locale, house.lang)} className="text-body text-ink2">{house.text}</p>}
        {props.mode === 'open' && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-h3">{formatPrice(props.product.pricePiastres)}</span>
              <span className="latin text-caption tracking-label text-ink2">{CURRENCY_LABEL}</span>
            </div>
            <AddToBag
              productId={props.product.id}
              pricePiastres={props.product.pricePiastres}
              inStock={props.product.inStock}
              family={props.product.family}
              // The dark room stands over the masthead: no bag for a drop to reach.
              drop={false}
              className={`${primarySurface} w-full`}
            />
          </>
        )}
        <p className="text-small text-ink3">{copy.revealFrom}</p>
        {arriving && <p className="text-small text-ink2" aria-hidden="true">{touch ? copy.revealOnwardTouch : copy.revealOnward}</p>}
      </aside>

      <button
        ref={close}
        type="button"
        className="reveal-close"
        aria-label={arriving ? copy.revealOnwardLabel : copy.close}
        onClick={() => { if (arriving) goOn(controller.current, id); else void controller.current?.close(); }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>,
    document.body,
  );
}

/** On the way: straight to the page. Counted only when it cut something short. */
function goOn(controller: RevealController | null, productId: string): void {
  if (controller?.skip()) void recordBrowsing('reveal_skip', { productId });
}
