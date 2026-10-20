'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTE_TIERS, DIAL_HOURS, noteHours, skinDay,
  type DayPhase, type NoteTier, type LongevityBand, type NoteIcon, type ProjectionBand,
} from '@diyar/domain';
import { glassPalette, tierTones } from '@diyar/tokens';
import { PRODUCT, type Locale } from '@diyar/i18n';
import { NoteIconMark } from '@/features/catalogue/NoteChip';
import { recordBrowsing } from '@/features/analytics/record';
import { prefersStill } from '@/features/motion/motion';
import { secondarySurface } from '@/features/shell/primary-surface';
import type { DialController } from './dial-controller';
import { polar, R, RING } from './dial-geometry';

/**
 * LA DURÉE — a perfume's day on the skin, as a watch dial (founder 19 Oct
 * 2026; design-reference/experiences/02-la-duree.html). It replaced the
 * "evolution" chart on the product page on 20 Oct 2026.
 *
 * Three rings record the three tiers as the hand passes the hours — thick
 * where a tier is strong, thinning as it fades; the notes sit on their ring as
 * beads, light when the hand reaches them and evaporate when their time is
 * over; the perfume's air swells and fades around the face.
 *
 * COMPACT, where the prototype pinned six screens of scrolling: the visitor
 * turns the hand, or presses "spray" to watch the day pass. It never plays by
 * itself — a long motion nobody asked for is the opposite of law VI.
 *
 * HONEST: the shapes are the domain's `skinDay` of the two bands recorded for
 * the perfume, and the caption says so with the bands' own source, always —
 * an illustration of the recorded bands, not a measurement — whether the house
 * declared them or buyers' reviews did. No sentence here says how many hours a
 * perfume lasts; a band is a word, never a number.
 *
 * React draws the face once, so the server sends a whole, still dial; the
 * controller winds it (`dial-controller.ts`), loaded as the dial nears the screen.
 */
export interface SkinDialProps {
  productId: string;
  family: string;
  longevity: { band: LongevityBand; source: string; word: string };
  projection: { band: ProjectionBand; word: string };
  /** Where the bands came from, in the visitor's words — the specimen label's source line. */
  sourceWord: string;
  notes: Readonly<Record<NoteTier, readonly string[]>>;
  english: Readonly<Record<string, string>>;
  icons: Readonly<Record<string, NoteIcon>>;
  locale: Locale;
}

/**
 * A coordinate as the page prints it. The server and the browser compute a
 * cosine to different last digits, and an unrounded attribute is a hydration
 * mismatch React will not patch.
 */
const r2 = (n: number): string => n.toFixed(2);

/** The keys the dial answers to, as a slider does. */
const EARLY_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

export function SkinDial({ productId, family, longevity, projection, sourceWord, notes, english, icons, locale }: SkinDialProps) {
  const copy = PRODUCT[locale];
  const day = useMemo(() => skinDay(longevity.band, projection.band), [longevity.band, projection.band]);
  const shown = (note: string) => (locale === 'en' ? english[note] ?? note : note);
  const [phase, setPhase] = useState<DayPhase>('top');

  const face = useRef<HTMLDivElement>(null);
  const segments = useRef<SVGGElement>(null);
  const engraving = useRef<SVGGElement>(null);
  const needle = useRef<SVGGElement>(null);
  const dots = useRef<Partial<Record<NoteTier, SVGCircleElement | null>>>({});
  const beadEls = useRef<Array<SVGGElement | null>>([]);
  const aura = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const controller = useRef<DialController | null>(null);
  const loader = useRef<(() => Promise<DialController | null>) | null>(null);

  /*
   * Keyed by the notes' CONTENT, not the object that carries them. The first
   * event of a visit sets the visitor's cookie, which makes Next refresh the
   * page; the refreshed props are new objects with the same notes, and keyed
   * by identity the dial was rebuilt — its hand thrown back to the spray in
   * the middle of a turn (found in the browser, 20 Oct 2026).
   */
  const notesKey = NOTE_TIERS.map((tier) => notes[tier].join('␟')).join('␞');
  const beads = useMemo(() => NOTE_TIERS.flatMap((tier) => {
    const hours = noteHours(day, tier, notes[tier].length);
    return notes[tier].map((note, i) => ({ tier, note, hour: hours[i]! }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `notesKey` stands for `notes`
  }), [day, notesKey]);

  const tones = tierTones(family);
  const mist = glassPalette(family).mist;
  const valueText = copy.dialValue;
  const phaseWords = copy.dialPhase;

  useEffect(() => {
    const parts = {
      face: face.current, segments: segments.current, engraving: engraving.current, needle: needle.current,
      aura: aura.current, canvas: canvas.current, time: time.current,
    };
    const dotEls = NOTE_TIERS.map((tier) => dots.current[tier]);
    if (Object.values(parts).some((p) => !p) || dotEls.some((d) => !d)) return;
    /*
     * The controller is not part of the page's first load: the face is already
     * drawn by the server, and what winds it is fetched once the page is idle,
     * or as the dial comes near the screen if that is sooner (CLAUDE.md §14 —
     * check bundle impact; the reveal's stage loads on press for the same
     * reason). A key or a "spray" pressed before it has arrived is kept and
     * handed on, never lost.
     */
    let live = true;
    let dial: DialController | null = null;
    let seen: IntersectionObserver | null = null;
    let loading: Promise<DialController | null> | null = null;
    const load = () => (loading ??= import('./dial-controller').then(({ DialController: Controller }) => {
      if (!live) return null;
      dial = new Controller(
        {
          face: parts.face!, segments: parts.segments!, engraving: parts.engraving!, needle: parts.needle!,
          aura: parts.aura!, canvas: parts.canvas!, time: parts.time!,
          dots: { top: dotEls[0]!, heart: dotEls[1]!, base: dotEls[2]! },
          beads: beads.map((b, i) => ({ el: beadEls.current[i]!, tier: b.tier, hour: b.hour })).filter((b) => b.el),
        },
        day,
        {
          onPhase: setPhase,
          onFirstTurn: () => { void recordBrowsing('dial_turn', { productId }); },
          valueText: (h, m, p) => valueText(String(h), String(m).padStart(2, '0'), phaseWords[p].title),
        },
        prefersStill(),
      );
      controller.current = dial;
      // The guilloché is cut as the dial comes into view, once.
      seen = new IntersectionObserver(([view]) => {
        if (!view?.isIntersecting) return;
        seen?.disconnect();
        dial?.engrave();
      }, { threshold: 0.3 });
      seen.observe(parts.face!);
      return dial;
    }));
    loader.current = load;
    const near = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      near.disconnect();
      void load();
    }, { rootMargin: '240px 0px' });
    near.observe(parts.face!);
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(() => { void load(); }, { timeout: 2500 })
      : window.setTimeout(() => { void load(); }, 1500);
    return () => {
      live = false;
      near.disconnect();
      seen?.disconnect();
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle); else window.clearTimeout(idle);
      dial?.dispose();
      controller.current = null;
      loader.current = null;
    };
  }, [day, beads, productId, valueText, phaseWords]);

  /** A key pressed before the controller arrived: kept, and given to it when it does. */
  const early = (event: React.KeyboardEvent) => {
    if (controller.current || !loader.current || !EARLY_KEYS.has(event.key)) return;
    event.preventDefault();
    const key = event.key;
    void loader.current().then((dial) => { dial?.press(key); });
  };
  const spray = () => {
    if (controller.current) { controller.current.play(); return; }
    void loader.current?.().then((dial) => { dial?.play(); });
  };

  const words = phaseWords[phase];
  const list = phase === 'trace' ? [] : notes[phase].map(shown);

  return (
    <figure
      className="skin-dial border border-line bg-raised p-4 pt-5 lg:p-7"
      style={{
        ['--dial-top-paper' as string]: tones.paper.top,
        ['--dial-heart-paper' as string]: tones.paper.heart,
        ['--dial-base-paper' as string]: tones.paper.base,
        ['--dial-top-night' as string]: tones.night.top,
        ['--dial-heart-night' as string]: tones.night.heart,
        ['--dial-base-night' as string]: tones.night.base,
        ['--dial-mist' as string]: mist,
      }}
    >
      {/* The caption is the dial's honesty: what it is drawn from, and that it is not a measurement. */}
      <figcaption className="mb-6">
        <h3 className="text-bodyLg font-medium lg:text-h4">{copy.dialTitle}</h3>
        <p className="mt-1 max-w-proseMax text-small text-ink3">
          {copy.dialSource(longevity.word, projection.word)}{' '}
          <span className="text-accent">{sourceWord}</span>
        </p>
      </figcaption>

      <div className="grid items-center gap-7 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:gap-10">
        <div className="dial-wrap">
          <div ref={aura} aria-hidden="true" className="dial-aura" />
          <canvas ref={canvas} aria-hidden="true" className="dial-vapour" />
          <div
            ref={face}
            role="slider"
            tabIndex={0}
            aria-label={copy.dialLabel}
            aria-valuemin={0}
            aria-valuemax={DIAL_HOURS}
            aria-valuenow={0}
            aria-valuetext={valueText('0', '00', phaseWords.top.title)}
            onKeyDown={early}
            className="dial-face"
          >
            <svg viewBox="-320 -320 640 640" aria-hidden="true" className="dial-svg">
              <circle r={R.bezel} className="dial-bezel" />
              <circle r={R.bezel - 6} className="dial-bezel dial-bezel-inner" />
              <circle r={R.sub} className="dial-sub" />
              <g ref={engraving} />
              <g>
                {Array.from({ length: DIAL_HOURS * 4 }, (_, m) => {
                  const major = m % 4 === 0;
                  const [x0, y0] = polar(major ? R.majorIn : R.tickIn, m / 4);
                  const [x1, y1] = polar(R.tickOut, m / 4);
                  return <line key={m} x1={r2(x0)} y1={r2(y0)} x2={r2(x1)} y2={r2(y1)} className={major ? 'dial-tick dial-tick-major' : 'dial-tick'} />;
                })}
                {Array.from({ length: DIAL_HOURS / 2 }, (_, i) => {
                  const [x, y] = polar(R.numeral, i * 2);
                  return <text key={i} x={r2(x)} y={r2(y)} className="dial-numeral">{i * 2}</text>;
                })}
              </g>
              {NOTE_TIERS.map((tier) => <circle key={tier} r={RING[tier]} className="dial-guide" />)}
              <g ref={segments} />
              <g>
                {beads.map((bead, i) => {
                  const [x, y] = polar(RING[bead.tier], bead.hour);
                  return (
                    <g key={`${bead.tier}-${bead.note}`} ref={(el) => { beadEls.current[i] = el; }} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`} className={`dial-bead dial-${bead.tier}`}>
                      <g className="dial-bead-pop" style={{ animationDelay: `${(NOTE_TIERS.indexOf(bead.tier) * 3 + i) * 60}ms` }}>
                        <circle r={17} className="dial-bead-disc" />
                        <NoteIconMark icon={icons[bead.note] ?? null} x={-11} y={-11} width={22} height={22} className="dial-bead-icon" />
                      </g>
                    </g>
                  );
                })}
              </g>
              <g ref={needle} className="dial-needle">
                <line x1={0} y1={-R.sub - 4} x2={0} y2={-R.tickOut + 2} className="dial-needle-line" />
                <line x1={0} y1={R.sub + 4} x2={0} y2={R.sub + 30} className="dial-needle-line" />
                <path d={`M0 ${R.sub + 24}l5 11-5 11-5-11z`} className="dial-needle-tail" />
                {NOTE_TIERS.map((tier) => (
                  <circle key={tier} ref={(el) => { dots.current[tier] = el; }} cy={-RING[tier]} r={tier === 'top' ? 9.5 : 2.5} className={`dial-dot dial-${tier}`} />
                ))}
              </g>
            </svg>
            <div aria-hidden="true" className="dial-readout">
              <span className="latin dial-readout-label">ON THE SKIN</span>
              <span ref={time} className="latin tnum dial-readout-time">0:00</span>
              <span className="dial-readout-unit">{copy.dialSince}</span>
            </div>
          </div>
        </div>

        <div>
          {/* What the hand is passing through, in words — announced as it changes. */}
          <div aria-live="polite" className="min-h-[9.5rem]">
            <span className="latin text-micro tracking-label text-accent">{words.kicker}</span>
            <h4 className="mt-2 font-display text-h3 leading-heading lg:text-h2">{words.title}</h4>
            <p className="mt-2 max-w-[38ch] text-body leading-relaxed text-ink2">{words.text(list.length ? copy.dialAnd(list) : '')}</p>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-small text-ink3">
            {NOTE_TIERS.map((tier) => (
              <li key={tier} className="flex items-center gap-2">
                <i aria-hidden="true" className={`dial-swatch dial-${tier}`} />
                {tier === 'top' ? copy.topNotes : tier === 'heart' ? copy.heartNotes : copy.baseNotes}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" onClick={spray} className={`${secondarySurface} px-6`}>
              {copy.dialSpray}
            </button>
            <span className="text-small text-ink3">{copy.dialHint}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
