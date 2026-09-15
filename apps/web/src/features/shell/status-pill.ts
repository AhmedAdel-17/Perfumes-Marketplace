/**
 * A status label: one short word in a pill, beside the thing it describes.
 *
 * OUTLINED, NEVER TINTED. Every one of these used to be `bg-accent/15
 * text-accent`, copied into seven files, and it measured 4.08:1 on paper. A
 * translucent fill darkens the ground an ink was calibrated against, and every
 * calibrated ink sits only just above 4.5:1 on the grounds it was tested on —
 * so a tint spends a margin that was never there. On noir the same pill cleared
 * the floor, which is how it survived until the light theme was audited.
 *
 * With no fill, the text sits on whatever ground the pill is placed on, and the
 * token tests already prove each ink against each ground in both themes. The
 * BORDER may be translucent: it carries no text, so it has no floor to fail.
 *
 * A class string rather than a component, so each caller keeps its own element
 * and this module carries no `'use client'` — see `primary-surface.tsx`.
 * `packages/tokens/src/tint.test.ts` refuses the tinted form coming back.
 */
export type StatusTone = 'accent' | 'danger' | 'quiet';

const TONES: Record<StatusTone, string> = {
  accent: 'border-accent/50 text-accent',
  danger: 'border-danger/50 text-danger',
  quiet: 'border-line text-ink2',
};

export const statusPill = (tone: StatusTone): string =>
  `rounded-pill border px-3 py-1 text-micro tracking-label ${TONES[tone]}`;
