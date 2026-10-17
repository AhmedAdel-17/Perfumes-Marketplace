'use client';

import { useId } from 'react';

/**
 * The house's loading indicator — "Le Rituel" on the classic flacon "Poire"
 * (founder, 17 Oct 2026; design-reference/loader-classic-2026-10-17.html).
 *
 * A vintage atomiser bottle — a flattened round body on a pedestal foot, an
 * oval label, a gold collar and domed head, and a braided tube down to a pear
 * bulb with a fringed tassel. It FILLS while something is on its way and, when
 * it has arrived, the bulb is squeezed and it SPRAYS once: filling means "a
 * moment", the spritz means "ready". Three sizes from one drawing — a page
 * (RouteLoader), a section (SectionLoading) and a button (Pending) — and,
 * where the wait is measurable, the liquid shows the real amount
 * (UploadProgress), not a loop.
 *
 * PATTERN — a presentational component plus CSS state classes (`flacon-done`,
 * a determinate level). It keeps no state; whoever knows the state of the wait
 * says which one applies.
 *
 * A client component for one reason: the liquid is clipped to the round body
 * by a clipPath, and a clipPath needs an id unique on the page — several of
 * these can be on screen at once — which `useId` gives.
 *
 * The bottle is a real-world object, so it is never mirrored: it sprays to the
 * right in Arabic and English alike (CLAUDE.md §14).
 */

type Size = 'lg' | 'md' | 'sm';

/**
 * Spelled out, not built as `flacon-${size}`: the stylesheet keeps only class
 * names it can find written in the source, and a computed one is dropped —
 * which is how the page-sized flacon first rendered at a quarter of its size.
 */
const SIZE: Record<Size, string> = { lg: 'flacon-lg', md: 'flacon-md', sm: 'flacon-sm' };

const BODY = 'M45 37c13.4 0 22 6.6 22 16.2S58.4 69.5 45 69.5 23 62.8 23 53.2 31.6 37 45 37z';

/** Where the droplets land, relative to the nozzle: an open fan, never a line. */
const DROPS: ReadonlyArray<readonly [number, number, number]> = [
  [16, -9, 1.4], [21, -4, 1], [24, 1, 1.3], [19, 5, 0.9], [27, -7, 0.8], [30, -1, 1.1],
  [26, 6, 0.7], [13, -2, 0.8], [33, 4, 0.6], [22, -11, 0.6], [35, -5, 0.5], [29, 9, 0.5],
];

/** The liquid's travel inside the body, in the drawing's own units. */
const EMPTY = 34;
const FULL = 3;

export function FlaconLoader({
  size, progress, done = false, className = '',
}: {
  size: Size;
  /** 0–1 when the wait is measurable: the level shows it. Omitted, it fills and drains. */
  progress?: number;
  /** The wait is over: the liquid settles full, the bulb is squeezed, it sprays once. */
  done?: boolean;
  className?: string;
}) {
  const clip = `flacon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const determinate = typeof progress === 'number';
  const level = determinate ? EMPTY - (EMPTY - FULL) * Math.min(1, Math.max(0, progress)) : undefined;
  const detailed = size !== 'sm';

  return (
    <svg
      viewBox="0 0 90 80"
      aria-hidden="true"
      className={[
        'flacon', SIZE[size],
        determinate ? 'flacon-determinate' : 'flacon-filling',
        done ? 'flacon-done' : '',
        className,
      ].join(' ')}
    >
      <defs>
        <clipPath id={clip}><path d={BODY} /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g className="flacon-level" style={level === undefined ? undefined : { transform: `translateY(${level}px)` }}>
          <g className="flacon-wave">
            <path className="flacon-liquid" d="M0 37q6-3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0V95H0z" />
            <path className="flacon-surface" d="M0 37q6-3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0" />
          </g>
        </g>
      </g>
      <path className="flacon-line" d={BODY} />
      <path className="flacon-line" d="M37.5 69.2 36 72.5h18l-1.5-3.3" />
      {detailed && (
        <>
          {/* The label: a cartouche on the glass, as every old flacon had. */}
          <ellipse className="flacon-label" cx="45" cy="54" rx="9" ry="5.6" />
          <path className="flacon-thin" d="M40.5 54h9" />
          <path className="flacon-thin" d="M28.5 47.5c1.6-3.6 4.6-6 8.4-7.2" />
        </>
      )}
      <rect className="flacon-line" x="41" y="31" width="8" height="6" />
      <rect className="flacon-collar" x="38.5" y="28" width="13" height="3.2" />
      <g className="flacon-head">
        <path className="flacon-line" d="M41.5 28v-2.6c0-2.2 1.6-3.6 3.5-3.6s3.5 1.4 3.5 3.6V28" />
        <path className="flacon-line" d="M48.5 25.2h3.4" />
        <circle className="flacon-nozzle" cx="45" cy="21" r=".9" />
      </g>
      {detailed && (
        <>
          {/* The braided tube, the pear bulb, the tassel. */}
          <path className="flacon-line" d="M41.5 25.6c-8 .2-15.5 2.4-20 7.6-2.4 2.8-4.2 5.4-5.2 8.2" />
          <path className="flacon-thin" d="M38 25.8l.8 1.4M33.5 26.6l.8 1.4M29 28.2l.8 1.4M25 30.8l1 1.2M21.6 34.4l1.2 1" />
          <g className="flacon-bulb">
            <path className="flacon-line" d="M16.3 41.4c-3.4.4-6.4 4-6.4 8.8 0 4.6 3 8.3 6.5 8.3s6.5-3.7 6.5-8.3c0-4.8-3.1-9.2-6.6-8.8z" />
          </g>
          <circle className="flacon-collar" cx="16.4" cy="59.6" r="1.3" />
          <path className="flacon-thin" d="M16.4 61v7M14.6 61.4l-1 6.6M18.2 61.4l1 6.6M13.4 61.2l-2 6M19.4 61.2l2 6" />
          <g className="flacon-mist">
            <g className="flacon-cloud">
              <circle cx="61" cy="25.2" r="9" opacity=".08" />
              <circle cx="59.5" cy="25.2" r="5.8" opacity=".14" />
              <circle cx="58" cy="25.2" r="3.2" opacity=".22" />
            </g>
            {DROPS.map(([dx, dy, r], i) => (
              <circle
                key={i}
                className="flacon-drop"
                cx="52.4"
                cy="25.2"
                r={r}
                style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${(i % 5) * 30}ms` }}
              />
            ))}
          </g>
        </>
      )}
    </svg>
  );
}

/**
 * A button's waiting state: the small flacon beside the label it already had
 * ("…جارٍ الإرسال"). The label stays, because the bottle alone does not say
 * WHAT is being waited for.
 */
export function Pending({ label }: { label: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <FlaconLoader size="sm" />
      <span>{label}</span>
    </span>
  );
}

/**
 * A section waiting for its content: the medium flacon and one quiet line. It
 * fades in only after the base duration, so a fast answer never blinks a
 * loader at anyone.
 */
export function SectionLoading({ label, delayed = true }: {
  label: string;
  /** False where the container already waits before showing it (the search results). */
  delayed?: boolean;
}) {
  return (
    <div role="status" className={`${delayed ? 'loader-delayed ' : ''}flex flex-col items-center gap-3 py-9`}>
      <FlaconLoader size="md" />
      <p className="text-body text-ink3">{label}</p>
    </div>
  );
}

/**
 * A measurable wait — an upload — with the liquid at the real fraction, and the
 * spritz when it reaches the top. The progressbar role and its value are what
 * a screen reader hears; the flacon is the picture.
 */
export function UploadProgress({ progress, label, note }: { progress: number; label: string; note: string }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-4" aria-live="polite">
      <FlaconLoader size="md" progress={progress} done={progress >= 1} />
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="flex flex-col gap-1"
      >
        <span className="latin tnum text-h4 text-ink">{percent}%</span>
        <span className="text-small text-ink3">{note}</span>
      </div>
    </div>
  );
}
