import { NOTE_ICON } from './note-icons';

/**
 * The notes pyramid.
 *
 * A vertical spine with three glowing orbs — top, heart, base — matching
 * design-reference/product.html. The spine is a gradient through the three tier
 * colours and is positioned with LOGICAL properties: in RTL, inline-start is the
 * right edge, which is where the orbs sit. Getting that backwards put the spine
 * 350px away from its own nodes once already (DESIGN_DOCTRINE §4a).
 *
 * Driven entirely by product data. Nothing here is hardcoded.
 */
const TIERS = [
  { key: 'top', en: 'TOP', ar: 'القمة', when: 'أول ٣٠ دقيقة', colour: 'var(--note-top)' },
  { key: 'heart', en: 'HEART', ar: 'القلب', when: 'ساعتان', colour: 'var(--note-heart)' },
  { key: 'base', en: 'BASE', ar: 'القاعدة', when: 'حتى ٨ ساعات', colour: 'var(--note-base)' },
] as const;

export function NotesPyramid({
  top, heart, base,
}: { top: string[]; heart: string[]; base: string[] }) {
  const notes: Record<string, string[]> = { top, heart, base };

  return (
    <section
      className="relative px-5"
      style={{
        // Tier colours as CSS variables so the spine gradient can reference them.
        ['--note-top' as string]: '#C2A85C',
        ['--note-heart' as string]: '#B5697E',
        ['--note-base' as string]: '#8A6838',
      }}
    >
      <div
        aria-hidden
        className="absolute bottom-[34px] top-2 w-[2px] opacity-[.55]"
        style={{
          insetInlineStart: 'calc(20px + 47px)',
          background:
            'linear-gradient(to bottom,var(--note-top) 0%,var(--note-top) 18%,var(--note-heart) 44%,var(--note-heart) 58%,var(--note-base) 84%,var(--note-base) 100%)',
        }}
      />

      {TIERS.map((tier, i) => {
        const Icon = NOTE_ICON[tier.key];
        const list = notes[tier.key] ?? [];
        return (
          <div key={tier.key} className={`relative flex ${i === TIERS.length - 1 ? 'pb-2' : 'pb-7'}`}>
            <div className="relative w-[96px] flex-none pt-[2px]">
              <div className="relative flex h-[96px] w-[96px] items-center justify-center rounded-pill">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-pill"
                  style={{ background: `radial-gradient(circle,${tier.colour}2E 0%,transparent 68%)` }}
                />
                <span
                  aria-hidden
                  className="absolute inset-[14px] rounded-pill border border-bone/[.13]"
                />
                <span className="relative z-[2]" style={{ color: tier.colour }}>
                  <Icon />
                </span>
              </div>
              <div className="mt-2 text-center text-micro text-faint">{tier.when}</div>
            </div>

            <div className="flex-1 ps-5 pt-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  aria-hidden
                  className="block h-[6px] w-[6px] rounded-pill"
                  style={{ background: tier.colour }}
                />
                <span className="latin text-micro tracking-label" style={{ color: tier.colour }}>
                  {tier.en}
                </span>
              </div>
              <h3 className="mb-3 font-display text-h4">{tier.ar}</h3>
              <ul className="flex flex-wrap gap-2">
                {list.map((note) => (
                  <li
                    key={note}
                    className="tappable flex h-touch items-center gap-2 border border-hair bg-l1 px-3 text-small"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </section>
  );
}
