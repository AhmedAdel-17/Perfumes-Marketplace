import type { NoteIcon } from '@diyar/domain';
import { pick, PRODUCT, type Locale } from '@diyar/i18n';
import { NoteChip } from '@/features/catalogue/NoteChip';

/**
 * The notes, tier by tier (visual identity v2).
 *
 * Laboratoire prints the pyramid the way it prints everything else: as a
 * register. Three ruled columns from `lg`, stacked below it, each with the
 * tier's name, when it is smelled, and its notes. The glowing orbs and the
 * gradient spine of the first identity are gone — they were the pyramid
 * illustrated, and this is the pyramid stated.
 *
 * The tier colours survive as a single dot each — data-visualisation roles
 * (`--c-note-*`, theme.ts), the same on every perfume. The day-on-the-skin
 * dial below draws the tiers in the perfume's OWN colours instead (its family's,
 * La Durée, 20 Oct 2026), and carries its own legend.
 *
 * EVERY NOTE IS A SEARCH, as on the home page's index: `/search?q=<the note as
 * the house wrote it>`, because search already matches notes and the visitor
 * who likes saffron here is one press from every other perfume that has it.
 */
const TIERS = [
  { key: 'top', en: 'TOP', name: 'topNotes', when: 'topWhen', channels: 'var(--c-note-top)' },
  { key: 'heart', en: 'HEART', name: 'heartNotes', when: 'heartWhen', channels: 'var(--c-note-heart)' },
  { key: 'base', en: 'BASE', name: 'baseNotes', when: 'baseWhen', channels: 'var(--c-note-base)' },
] as const;

export function NotesPyramid({
  top, heart, base, english, icons, locale,
}: {
  top: string[];
  heart: string[];
  base: string[];
  /** English names from the platform glossary, keyed by the Arabic note. */
  english: Readonly<Record<string, string>>;
  /** The glossary's drawing for each note that has one, keyed the same way. */
  icons: Readonly<Record<string, NoteIcon>>;
  locale: Locale;
}) {
  const copy = PRODUCT[locale];
  const notes: Record<string, string[]> = { top, heart, base };

  return (
    <div className="grid gap-7 lg:grid-cols-3 lg:gap-8">
      {TIERS.filter((tier) => (notes[tier.key] ?? []).length > 0).map((tier) => (
        <div key={tier.key}>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="block h-[6px] w-[6px] rounded-pill" style={{ background: `rgb(${tier.channels})` }} />
              <span className="latin text-micro tracking-label text-ink2">{tier.en}</span>
            </span>
            <span className="text-small text-ink3">{copy[tier.when]}</span>
          </div>
          <h3 className="mb-4 font-display text-h4 lg:text-h3">{copy[tier.name]}</h3>
          <ul className="flex flex-wrap gap-2">
            {(notes[tier.key] ?? []).map((note) => {
              const shown = pick(locale, note, english[note]);
              return (
                <li key={note}>
                  <NoteChip
                    note={note}
                    shown={shown}
                    icon={icons[note] ?? null}
                    locale={locale}
                    label={copy.searchNote(shown.text)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
