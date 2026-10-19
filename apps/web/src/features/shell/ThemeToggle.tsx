'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, themes, type ThemeName,
} from '@diyar/tokens';
import { SHELL } from '@diyar/i18n';
import { Icon } from '@diyar/ui';
import { useLocale } from './LocaleProvider';

/**
 * Light (Laboratoire, the default) or dark (Noir) — a sun that becomes a moon.
 *
 * Redesigned 17 Oct 2026 at the founder's request: the PAPER / NOIR segmented
 * pair read as generic. One square control now, matched to the language pair
 * beside it, carrying the CURRENT appearance as a drawing: the sun by day, the
 * moon by night. On a switch the outgoing drawing turns a quarter and fades as
 * the incoming one turns in after it — slow, eased, no spring (law VI).
 *
 * A SWITCH, semantically: `role="switch"` named "dark mode", checked when dark.
 * That is what it is — one setting, on or off — and a screen reader announces
 * it as such. (The segmented version's `aria-pressed` pair also made every
 * `button[aria-pressed]` on a page find the theme first, which a filter test
 * had been quietly clicking instead of the filter it meant.)
 *
 * The whole page cross-fades where the browser has View Transitions, so a
 * photograph, a hairline and a line of text change together instead of the
 * ground changing under them. Elsewhere the ground-and-ink transition in
 * globals.css carries it.
 *
 * Moon is the one icon drawn for this; the founder approved it (CLAUDE.md §12).
 */

/**
 * Present on the root only while a chosen switch is settling. globals.css
 * animates the ground and ink under it and nowhere else, so a page LOADING in
 * the remembered theme never animates into it.
 */
const SWITCHING_ATTRIBUTE = 'data-theme-switching';

/** Keeps the mobile browser's chrome continuous with the page it frames. */
function paintBrowserChrome(theme: ThemeName) {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', themes[theme].ground);
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function ThemeToggle() {
  const copy = SHELL[useLocale()];
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let attribute = root.getAttribute(THEME_ATTRIBUTE);
    /*
     * The theme script did not run. Next serves some pages — the 404s, in
     * development at least — as an empty error shell that React renders on the
     * client, and a <script> React inserts never executes, so a Noir visitor
     * met a paper 404. Apply the remembered choice here instead: later than
     * the script would have, so the page switches once after loading, but it
     * switches to what the visitor chose rather than staying on the default.
     */
    if (attribute !== 'light' && attribute !== 'dark') {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          root.setAttribute(THEME_ATTRIBUTE, stored);
          paintBrowserChrome(stored);
          attribute = stored;
        }
      } catch { /* storage refused: the default stands */ }
    }
    setTheme(attribute === 'light' || attribute === 'dark' ? attribute : DEFAULT_THEME);
  }, []);

  const apply = (next: ThemeName) => {
    const root = document.documentElement;
    root.setAttribute(THEME_ATTRIBUTE, next);
    paintBrowserChrome(next);
    setTheme(next);
    // A refused write — private mode, storage disabled — must not stop the
    // theme changing. The choice simply does not survive the next page.
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* not fatal */ }
  };

  const toggle = () => {
    const next: ThemeName = theme === 'dark' ? 'light' : 'dark';
    const doc = document as ViewTransitionDocument;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !still) {
      doc.startViewTransition(() => apply(next));
      return;
    }
    // No View Transitions: ease the ground and ink instead. Cleared when the
    // ground has settled; the timeout covers the cases that fire no
    // transitionend (reduced motion). `transitionend` bubbles, so a link
    // finishing its own colour change must not end the body's.
    const root = document.documentElement;
    const body = document.body;
    root.setAttribute(SWITCHING_ATTRIBUTE, '');
    const settle = () => {
      body.removeEventListener('transitionend', onEnd);
      root.removeAttribute(SWITCHING_ATTRIBUTE);
    };
    const onEnd = (event: TransitionEvent) => { if (event.target === body) settle(); };
    body.addEventListener('transitionend', onEnd);
    window.setTimeout(settle, 1000);
    apply(next);
  };

  const dark = theme === 'dark';
  // Each drawing is either the one on show, or turned a quarter away and gone.
  const drawing = (shown: boolean, turn: string) => [
    'absolute h-[22px] w-[22px]',
    'transition-[opacity,transform] duration-slow ease-out',
    shown ? 'rotate-0 scale-100 opacity-100' : `${turn} scale-75 opacity-0`,
  ].join(' ');

  return (
    <button
      type="button"
      // Unknown until hydrated: the server cannot read the visitor's choice, so
      // until then this is a plain (disabled) button rather than a switch — a
      // switch must say whether it is on, and guessing would flip after paint.
      role={theme === null ? undefined : 'switch'}
      aria-checked={theme === null ? undefined : dark}
      aria-label={copy.dark}
      title={dark ? copy.light : copy.dark}
      onClick={toggle}
      disabled={theme === null}
      className={[
        'tappable group relative flex h-[36px] w-[36px] items-center justify-center',
        'border border-line text-ink2',
        'transition-colors duration-base ease-out',
        'hover:border-accent hover:text-accent active:opacity-press',
        'disabled:cursor-default',
      ].join(' ')}
    >
      <Icon.Sun aria-hidden="true" className={drawing(theme === 'light', '-rotate-90')} />
      <Icon.Moon aria-hidden="true" className={drawing(dark, 'rotate-90')} />
    </button>
  );
}
