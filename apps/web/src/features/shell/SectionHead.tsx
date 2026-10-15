import Link from 'next/link';
import type { Route } from 'next';

/**
 * A register's section head (identity v2 — `.sh` in 04-laboratoire.html): the
 * section's number, its title, and where to go for the whole of it, over a
 * full-strength rule.
 *
 * The number is a Latin label in both languages. It is what makes the page read
 * as a numbered register rather than a stack of marketing blocks, and it sits
 * ABOVE the title on a phone, where three columns do not fit.
 *
 * `link` is optional because Law I outranks symmetry: a head with nowhere real
 * to send the visitor has no link, rather than a link to a page that does not
 * exist yet.
 */
export function SectionHead({
  index, title, link, id,
}: {
  index: string;
  title: string;
  link?: { href: Route; label: string } | undefined;
  /** The heading's id, so a link elsewhere on the page can land on it. */
  id?: string;
}) {
  return (
    <div className="mb-7 grid grid-cols-1 items-end gap-1.5 border-b border-ink pb-4 sm:grid-cols-[auto_1fr_auto] sm:gap-6 lg:mb-8">
      <span className="latin text-small text-ink3 tnum">{index}</span>
      <h2 id={id} className="font-display text-h2 leading-heading lg:text-h2Lg xl:text-h1Lg">
        {title}
      </h2>
      {link && (
        <Link
          href={link.href}
          className="tappable inline-flex min-h-touch items-center self-end justify-self-start text-body text-ink transition-colors duration-base ease-out hover:text-accent sm:justify-self-end lg:text-bodyLg"
        >
          {/* The rule under the WORDS, not under the 44px target around them. */}
          <span className="border-b border-current">{link.label}</span>
        </Link>
      )}
    </div>
  );
}
