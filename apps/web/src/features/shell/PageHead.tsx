/**
 * A page's head in the register (visual identity v2): a Latin kicker with its
 * trailing rule, the title, anything that belongs under it, and a
 * full-strength rule across the foot.
 *
 * The kicker says something the title does not. On the English site a kicker
 * that repeated its title ("CHECKOUT / Checkout") read as a stutter, and every
 * page head was briefly a copy of this markup with its own spacing.
 *
 * The kicker is Latin in both languages, because Arabic is never set in the
 * label face (CLAUDE.md §15) — so it is passed already in English.
 */
export function PageHead({
  kicker, title, children, flush = false, className = '',
}: {
  /** A Latin label. Uppercased here; never Arabic. */
  kicker: string;
  title: React.ReactNode;
  /** An intro, a count, or a control that belongs to the head. */
  children?: React.ReactNode;
  /** No top padding: for a head that is centred in its own space (the 404). */
  flush?: boolean;
  /** Margins and the like. The space BELOW the head is the page's to set. */
  className?: string;
}) {
  return (
    <header className={`border-b border-ink pb-4 ${flush ? '' : 'pt-8 lg:pt-12'} ${className}`}>
      {/* The same arrival as the home page's opening, shorter: the kicker
          fades in as its rule draws, and the title rises after it. */}
      <span className="fade-in latin mb-3 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
        {kicker.toUpperCase()}
        <span aria-hidden="true" className="draw-in h-px w-12 bg-current [--rise-delay:120ms]" />
      </span>
      <h1 className="rise font-display text-h1 leading-heading [--rise-delay:80ms] lg:text-h1Lg">{title}</h1>
      {children}
    </header>
  );
}
