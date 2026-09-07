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
 * Driven entirely by product data, and coloured from the THEME rather than from
 * a palette import: `--c-note-*` is declared once per theme in theme.ts, so the
 * pyramid restates itself on paper without this file knowing there are two
 * themes. It holds channels (`194 168 92`), which is what lets the glow below
 * be written as a real translucent colour.
 */
const TIERS = [
  { key: 'top', en: 'TOP', ar: 'القمة', when: 'أول ٣٠ دقيقة', channels: 'var(--c-note-top)' },
  { key: 'heart', en: 'HEART', ar: 'القلب', when: 'ساعتان', channels: 'var(--c-note-heart)' },
  { key: 'base', en: 'BASE', ar: 'القاعدة', when: 'حتى ٨ ساعات', channels: 'var(--c-note-base)' },
] as const;

export function NotesPyramid({
  top, heart, base,
}: { top: string[]; heart: string[]; base: string[] }) {
  const notes: Record<string, string[]> = { top, heart, base };

  return (
    <section className="relative px-5">
      <div
        aria-hidden
        className="absolute bottom-[34px] top-2 w-[2px] opacity-[.55]"
        style={{
          insetInlineStart: 'calc(20px + 47px)',
          background:
            'linear-gradient(to bottom,' +
            'rgb(var(--c-note-top)) 0%,rgb(var(--c-note-top)) 18%,' +
            'rgb(var(--c-note-heart)) 44%,rgb(var(--c-note-heart)) 58%,' +
            'rgb(var(--c-note-base)) 84%,rgb(var(--c-note-base)) 100%)',
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
                  /* `${var}2E` — a hex alpha glued to a var() call — is not a
                     colour, so this gradient silently produced nothing and the
                     orbs sat unlit for as long as the component has existed.
                     Channels are what make a translucent tier expressible. */
                  style={{ background: `radial-gradient(circle,rgb(${tier.channels} / .18) 0%,transparent 68%)` }}
                />
                <span
                  aria-hidden
                  className="absolute inset-[14px] rounded-pill border border-ink/[.13]"
                />
                <span className="relative z-[2]" style={{ color: `rgb(${tier.channels})` }}>
                  <Icon />
                </span>
              </div>
              <div className="mt-2 text-center text-micro text-ink3">{tier.when}</div>
            </div>

            <div className="flex-1 ps-5 pt-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  aria-hidden
                  className="block h-[6px] w-[6px] rounded-pill"
                  style={{ background: `rgb(${tier.channels})` }}
                />
                <span className="latin text-micro tracking-label" style={{ color: `rgb(${tier.channels})` }}>
                  {tier.en}
                </span>
              </div>
              {/*
                h2, not h3. The product name is the h1 and these tiers are its
                direct children — h1 → h3 leaves a screen reader announcing a
                level that has no parent, and the reader cannot tell whether it
                missed something. The SIZE is unchanged; heading level and type
                scale are different decisions and this is why they are separate
                properties.
              */}
              <h2 className="mb-3 font-display text-h4">{tier.ar}</h2>
              <ul className="flex flex-wrap gap-2">
                {list.map((note) => (
                  <li
                    key={note}
                    className="tappable flex h-touch items-center gap-2 border border-line bg-raised px-3 text-small"
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
