'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, themes, type ThemeName,
} from '@diyar/tokens';
import { SHELL } from '@diyar/i18n';
import { useLocale } from './LocaleProvider';

/**
 * Paper (Laboratoire, the default) or Noir.
 *
 * A SEGMENTED CONTROL, not a switch, and the difference matters here. A switch
 * shows one state and asks you to infer the other; a visitor who has never seen
 * the light theme cannot tell whether the control turns something on or reveals
 * something. Two labelled segments show both worlds and mark which one you are
 * in — no inference, no icon that has to carry a concept on its own, and it
 * reads correctly to a screen reader without an explanation.
 *
 * No new icon was drawn for this. CLAUDE.md §12 says the icon set is closed
 * without asking, and a letterspaced Latin label is already the house's way of
 * naming a thing — it sits beside the wordmark rather than fighting it.
 *
 * The five states the doctrine requires are all present: rest, hover, press
 * (`active:opacity-press`), focus (the global accent ring), and — because this
 * control's state comes from a store the server cannot read — a HYDRATION state,
 * during which neither segment claims to be active. Rendering a guess and
 * correcting it a frame later is how a toggle ends up flickering the wrong way.
 */
// Light first: it is the default since identity v2 (FD-1, 14 Oct 2026).
const SEGMENTS: ReadonlyArray<{ theme: ThemeName; label: string; spoken: 'dark' | 'light' }> = [
  { theme: 'light', label: 'PAPER', spoken: 'light' },
  { theme: 'dark', label: 'NOIR', spoken: 'dark' },
];

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

  const choose = (next: ThemeName) => {
    const root = document.documentElement;
    root.setAttribute(SWITCHING_ATTRIBUTE, '');
    root.setAttribute(THEME_ATTRIBUTE, next);
    // Cleared when the ground has settled. The timeout covers the cases that
    // fire no transitionend: the same theme chosen twice, or reduced motion.
    // `transitionend` bubbles, so a link finishing its own colour change must
    // not end the body's.
    const body = document.body;
    const settle = () => {
      body.removeEventListener('transitionend', onEnd);
      root.removeAttribute(SWITCHING_ATTRIBUTE);
    };
    const onEnd = (event: TransitionEvent) => { if (event.target === body) settle(); };
    body.addEventListener('transitionend', onEnd);
    window.setTimeout(settle, 1000);
    paintBrowserChrome(next);
    setTheme(next);
    // A refused write — private mode, storage disabled — must not stop the
    // theme changing. The choice simply does not survive the next page.
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* not fatal */ }
  };

  return (
    <div
      role="group"
      aria-label={copy.appearance}
      className="inline-flex items-center border border-line"
    >
      {SEGMENTS.map(({ theme: name, label, spoken }, index) => (
        <button
          key={name}
          type="button"
          onClick={() => choose(name)}
          aria-pressed={theme === null ? undefined : theme === name}
          aria-label={copy[spoken]}
          className={[
            // 32px tall so the masthead stays quiet; `tappable` carries the
            // 44pt target the doctrine requires without inflating the chrome.
            'tappable latin flex h-[32px] items-center px-3 text-caption tracking-label',
            'transition-colors duration-base ease-out active:opacity-press',
            index === 1 ? 'border-s border-line' : '',
            theme === name ? 'text-ink' : 'text-ink3 hover:text-ink2',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
