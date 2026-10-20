/**
 * The reveal's stage — the room, its renderer and its mist, the reveal's whole
 * weight — fetched when it is wanted and then rendered DIRECTLY.
 *
 * Not through `next/dynamic`, as it was until 20 Oct 2026: that renders the
 * stage through Suspense, and React holds suspended content back for some
 * 300ms to reveal it in batches — so even a stage already downloaded answered
 * the press a third of a second late, measured. The press is answered within
 * `slow`, at once (DESIGN_DOCTRINE §8); here a component that has loaded is a
 * component, and the first frame of the reveal follows the press.
 */
import type { RevealStage } from './RevealStage';

export type StageComponent = typeof RevealStage;

let loaded: StageComponent | null = null;
let loading: Promise<StageComponent> | null = null;

/** The stage, if it has already been fetched. */
export const loadedStage = (): StageComponent | null => loaded;

/** Fetches the stage once; a failed fetch (a lost connection) may be tried again. */
export function loadStage(): Promise<StageComponent> {
  loading ??= import('./RevealStage').then(
    (m) => (loaded = m.RevealStage),
    (error: unknown) => { loading = null; throw error; },
  );
  return loading;
}
