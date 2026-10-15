import Link from 'next/link';
import { ThemeToggle } from '@/features/shell/ThemeToggle';
import { signOutSeller } from './actions';

/**
 * The portal's own chrome.
 *
 * Four destinations and a way out. A house does four things here — works the
 * queue, writes its listings, handles what comes back, and checks what it is
 * owed. Nothing more goes in here: a navigation offering more than a house
 * actually does is one it has to read past every time.
 *
 * Identity v2 (Phase C):
 *   - The labels are Arabic, so they are NOT letterspaced (CLAUDE.md §15). The
 *     first identity tracked them like Latin labels and broke the joins.
 *   - "You are here" is said three ways: `aria-current` for assistive
 *     technology, an ink rule under the link for the eye, and the ink colour.
 *     It used to be colour alone, which is the one thing the accessibility
 *     floor forbids.
 */
const DESTINATIONS = [
  { key: 'orders', href: '/seller/orders', label: 'الطلبات' },
  { key: 'listings', href: '/seller/listings', label: 'المنتجات' },
  // Between the work and the money, which is where a return actually sits: it
  // is work that has to be done, and it moves what the house is owed.
  { key: 'returns', href: '/seller/returns', label: 'الإرجاع' },
  { key: 'payouts', href: '/seller/payouts', label: 'المستحقّات' },
] as const;

export type SellerSection = (typeof DESTINATIONS)[number]['key'];

export function SellerNav({ current }: { current: SellerSection }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6">
      <nav aria-label="أقسام الدار" className="flex flex-wrap items-center gap-x-6">
        {DESTINATIONS.map((destination) => {
          const active = current === destination.key;
          return (
            <Link
              key={destination.key}
              href={destination.href}
              aria-current={active ? 'page' : undefined}
              /*
               * `min-w-touch` as well as the height: "الإرجاع" is 42px of narrow
               * glyphs, under the floor on the cross axis. A target has two
               * dimensions, and enforcing one of them is enforcing neither.
               * The rule sits on the band's own line, so the active link reads
               * as a tab of the band rather than an underlined word.
               */
              className={[
                'flex min-h-touch min-w-touch items-center justify-center border-b-2 text-body transition-colors duration-base ease-out hover:text-accent',
                active ? 'border-ink text-ink' : 'border-transparent text-ink2',
              ].join(' ')}
            >
              {destination.label}
            </Link>
          );
        })}
      </nav>

      <div className="ms-auto flex items-center gap-x-5">
        {/* The portal has no site footer, so appearance lives here. A house
            works these screens for hours; which way they are lit is not
            cosmetic. */}
        <ThemeToggle />
        <form action={signOutSeller}>
          <button
            type="submit"
            className="tappable flex min-h-touch min-w-touch items-center justify-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            خروج
          </button>
        </form>
      </div>
    </div>
  );
}
