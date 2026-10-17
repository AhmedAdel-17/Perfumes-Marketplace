'use client';

import { useEffect } from 'react';
import { motion } from '@diyar/tokens';

/**
 * A link to a FULL page load that lets the page fade out first.
 *
 * Only for the language switch: the other language is another document (its
 * `lang` and `dir` live on <html>), so the browser must load it whole, and a
 * whole load without this is a blink — the page vanishes, white, then the new
 * one. Fading out over `motion.quick` first makes it a change of scene.
 *
 * Still a plain <a href> underneath, so it works without JavaScript, opens in a
 * new tab on a modified click, and is a link to every assistive technology.
 *
 * `pageshow` clears the fade, because a visitor who presses BACK may be handed
 * this page from the back-forward cache exactly as it was left — faded to
 * nothing.
 */
const LEAVING = 'data-leaving';

export function LeaveLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  useEffect(() => {
    const restore = () => document.documentElement.removeAttribute(LEAVING);
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (
      event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;
    event.preventDefault();
    document.documentElement.setAttribute(LEAVING, '');
    window.setTimeout(() => window.location.assign(props.href), motion.quick);
  };

  return <a {...props} onClick={onClick} />;
}
