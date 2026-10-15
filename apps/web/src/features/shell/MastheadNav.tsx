'use client';

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
 * A client component for one reason — to mark the page you are on
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

export function MastheadNav({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const copy = SHELL[locale];
  const pathname = stripLocale(usePathname() ?? '/');

  return (
    <nav aria-label={copy.mainNav} className={className}>
      <ul className="flex items-center gap-6 lg:gap-8">
        {LINKS.map(({ href, label, matches }) => {
          const current = matches(pathname);
          return (
            <li key={href}>
              <Link
                href={localeHref(locale, href)}
                aria-current={current ? 'page' : undefined}
                className={[
                  'flex min-h-touch min-w-touch items-center justify-start text-body lg:text-bodyLg',
                  'transition-colors duration-base ease-out hover:text-accent active:opacity-press',
                  current ? 'text-ink' : 'text-ink2',
                ].join(' ')}
              >
                <span className={`border-b pb-1 ${current ? 'border-accent' : 'border-transparent'}`}>
                  {copy[label]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
