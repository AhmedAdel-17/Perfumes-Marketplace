/**
 * The head of a working screen — the seller portal and the operations console
 * (visual identity v2, Phase C).
 *
 * The same register as the shop's PageHead (a Latin kicker, the title, a
 * full-strength rule) at tool density: the head is shorter, and the section
 * navigation sits in its own ruled band beneath it rather than beside the title,
 * where on a phone it wrapped into the heading's line and on a monitor drifted
 * a page-width away from it. These screens are worked for hours; the
 * navigation is a fixture, not a flourish, so it gets a fixed place.
 */
export function ConsoleHead({
  kicker, title, nav, intro, children,
}: {
  /** A Latin label. Uppercased here; never Arabic. */
  kicker: string;
  title: React.ReactNode;
  /** The section navigation, in its own band. */
  nav: React.ReactNode;
  /** A short explanation under the title — what the screen is for. */
  intro?: React.ReactNode;
  /** Anything that belongs beside the title: a count, an action. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mx-5 mb-6 lg:mx-0 lg:mb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink pb-3 pt-7 lg:pt-9">
        <div>
          <span className="latin mb-2 flex items-center gap-3 text-micro tracking-label text-accent lg:text-caption">
            {kicker.toUpperCase()}
            <span aria-hidden="true" className="h-px w-12 bg-current" />
          </span>
          <h1 className="font-display text-h2 leading-heading lg:text-h1">{title}</h1>
          {intro && <p className="mt-2 max-w-proseMax text-body leading-relaxed text-ink2">{intro}</p>}
        </div>
        {children}
      </div>
      <div className="border-b border-line">{nav}</div>
    </header>
  );
}
