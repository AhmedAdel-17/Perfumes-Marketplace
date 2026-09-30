'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The three places a customer goes most, in the masthead.
 *
 * They lived only in the footer, and founder review (30 Sep 2026) found that a
 * visitor never learns they exist: a directory of houses nobody can see from
 * the top of the page is a directory most people will not find.
 *
 * A client component for one reason — to mark the page you are on
 * (`aria-current`), which is what turns a row of links into orientation.
 */
const LINKS = [
  { href: '/houses', label: 'الدور', matches: (path: string) => path === '/houses' || path.startsWith('/house/') },
  { href: '/search', label: 'ابحث', matches: (path: string) => path === '/search' },
  { href: '/order', label: 'تتبّع طلبك', matches: (path: string) => path === '/order' },
] as const;

export function MastheadNav({ className = '' }: { className?: string }) {
  const pathname = usePathname() ?? '/';

  return (
    <nav aria-label="التصفّح" className={className}>
      <ul className="flex items-center gap-6 lg:gap-8">
        {LINKS.map(({ href, label, matches }) => {
          const current = matches(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={[
                  'flex min-h-touch min-w-touch items-center justify-start text-body lg:text-bodyLg',
                  'transition-colors duration-base ease-out hover:text-accent active:opacity-press',
                  current ? 'text-ink' : 'text-ink2',
                ].join(' ')}
              >
                <span className={`border-b pb-1 ${current ? 'border-accent' : 'border-transparent'}`}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
