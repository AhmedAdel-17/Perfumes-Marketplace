'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, themes, type ThemeName,
} from '@diyar/tokens';

/**
 * Noir or paper.
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
 * (`active:opacity-press`), focus (the global brass ring), and — because this
 * control's state comes from a store the server cannot read — a HYDRATION state,
 * during which neither segment claims to be active. Rendering a guess and
 * correcting it a frame later is how a toggle ends up flickering the wrong way.
 */
const SEGMENTS: ReadonlyArray<{ theme: ThemeName; label: string; spoken: string }> = [
  { theme: 'dark', label: 'NOIR', spoken: 'الوضع الداكن' },
  { theme: 'light', label: 'PAPER', spoken: 'الوضع الفاتح' },
];

/** Keeps the mobile browser's chrome continuous with the page it frames. */
function paintBrowserChrome(theme: ThemeName) {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', themes[theme].ground);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const attribute = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    setTheme(attribute === 'light' || attribute === 'dark' ? attribute : DEFAULT_THEME);
  }, []);

  const choose = (next: ThemeName) => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
    paintBrowserChrome(next);
    setTheme(next);
    // A refused write — private mode, storage disabled — must not stop the
    // theme changing. The choice simply does not survive the next page.
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* not fatal */ }
  };

  return (
    <div
      role="group"
      aria-label="مظهر الموقع"
      className="inline-flex items-center border border-line/70"
    >
      {SEGMENTS.map(({ theme: name, label, spoken }, index) => (
        <button
          key={name}
          type="button"
          onClick={() => choose(name)}
          aria-pressed={theme === null ? undefined : theme === name}
          aria-label={spoken}
          className={[
            // 32px tall so the masthead stays quiet; `tappable` carries the
            // 44pt target the doctrine requires without inflating the chrome.
            'tappable latin flex h-[32px] items-center px-3 text-caption tracking-label',
            'transition-colors duration-base ease-out active:opacity-press',
            index === 1 ? 'border-s border-line/70' : '',
            theme === name ? 'text-ink' : 'text-ink3 hover:text-ink2',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
