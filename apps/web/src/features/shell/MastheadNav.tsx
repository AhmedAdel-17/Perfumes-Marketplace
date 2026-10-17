'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SHELL, stripLocale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from './LocaleProvider';

/**
 * The three places a customer goes most, in the masthead: the perfumes, the
 * houses, and an order already placed.
 *
 * They lived only in the footer, and founder review (30 Sep 2026) found that a
 * visitor never learns they exist: a directory of houses nobody can see from
 * the top of the page is a directory most people will not find.
 *
 * "ATOMISEUR" (header concept 02, chosen 17 Oct 2026): every link blooms a soft
 * cloud of the accent under the pointer, like a spritz in the air, and the
 * page you are on keeps its accent line. From `lg`, Perfumes opens the panel —
 * the scent families as vials, and the houses (PerfumesPanel, a server slot).
 *
 * THE PANEL OPENS FROM THE LINK, NOT FROM HOVER ALONE. A visitor who clicks a
 * vial lands on a new page with the pointer still where the panel was; a pure
 * `:hover` panel would reopen under them at the first twitch. So it opens when
 * the pointer ENTERS the Perfumes link (after a short intent delay, so a pass
 * across the bar does not flash it), stays while the pointer is anywhere in
 * the link or the panel, and closes on leaving, on Escape and on any click
 * inside. Keyboard focus opens it through `:focus-within` in CSS, so Tab walks
 * from the link straight into the vials.
 *
 * A client component for those handlers and to mark the page you are on
 * (`aria-current`), which is what turns a row of links into orientation.
 */
/*
 * Perfumes leads to the search page because that page IS the catalogue: every
 * published perfume, filterable. A second "Search" link to the same place would
 * be two names for one destination (identity v2, 14 Oct 2026).
 */
const LINKS = [
  { href: '/search', label: 'perfumes', matches: (path: string) => path === '/search' || path.startsWith('/p/') },
  { href: '/houses', label: 'houses', matches: (path: string) => path === '/houses' || path.startsWith('/house/') },
  { href: '/order', label: 'trackYourOrder', matches: (path: string) => path === '/order' },
] as const;

/** Hover intent and grace, in ms: enough to ignore a pass across, short enough to feel immediate. */
const INTENT = 120;

export function MastheadNav({ className = '', panel }: { className?: string; panel?: React.ReactNode }) {
  const locale = useLocale();
  const copy = SHELL[locale];
  const pathname = stripLocale(usePathname() ?? '/');
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const later = (next: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), INTENT);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Escape from inside the panel returns to the link that opened it.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <nav aria-label={copy.mainNav} className={className}>
      <ul className="flex items-center gap-6 lg:h-full lg:gap-2">
        {LINKS.map(({ href, label, matches }) => {
          const current = matches(pathname);
          const hasPanel = Boolean(panel) && href === '/search';
          return (
            <li
              key={href}
              className={hasPanel ? 'mast-menu lg:h-full' : 'lg:h-full'}
              data-open={hasPanel && open ? '' : undefined}
              onPointerLeave={hasPanel ? () => later(false) : undefined}
              onPointerEnter={hasPanel ? () => { if (open) window.clearTimeout(timer.current); } : undefined}
              onClick={hasPanel ? () => { window.clearTimeout(timer.current); setOpen(false); } : undefined}
            >
              <Link
                href={localeHref(locale, href)}
                aria-current={current ? 'page' : undefined}
                onPointerEnter={hasPanel ? () => later(true) : undefined}
                className={[
                  'mast-link flex min-h-touch min-w-touch items-center justify-start gap-2 text-body lg:h-full lg:px-[18px] lg:text-bodyLg',
                  'transition-colors duration-base ease-out hover:text-ink active:opacity-press',
                  current ? 'text-ink' : 'text-ink2',
                ].join(' ')}
              >
                {/* `nav-line` (globals.css): the accent line under the page you
                    are on, drawn in under the pointer. */}
                <span className="nav-line">{copy[label]}</span>
                {hasPanel && <span aria-hidden="true" className="mast-chevron hidden lg:block" />}
              </Link>
              {hasPanel && <div className="hidden lg:block">{panel}</div>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
