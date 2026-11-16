import type { IndexedNote } from '@diyar/api';
import { data as num, HOME, PRODUCT, type Locale } from '@diyar/i18n';
import { NoteChip } from '@/features/catalogue/NoteChip';

type Tier = 'top' | 'heart' | 'base';

/**
 * Search by the note, not the brand: the notes the published catalogue
 * carries, tier by tier, each with how many perfumes carry it.
 *
 * THE ORGAN (identity v3, 16 Nov 2026). A perfumer's organ is shelves of
 * bottles in tiers, the lightest at the top. Three shelves here, in the order
 * a perfume is smelled, each named at its reading edge and marked in its
 * tier's own colour — the same three the pyramid and the dial use. (It was
 * three columns of chips, which read as three tag clouds.)
 *
 * Every chip is a SEARCH, `/search?q=<the Arabic note>`, because search already
 * matches notes (the listing's `search_text` is built from all three tiers) and
 * a second route that did the same thing would be a second behaviour to keep in
 * step. The Arabic note is the query in both languages: it is what the houses
 * wrote and what the index holds.
 *
 * The count is a promise about the page the chip opens, and it is kept: both
 * are read from the published catalogue as `anon` — see `catalogue.noteIndex`.
 */
export function NoteIndex({ index, locale }: { index: Record<Tier, IndexedNote[]>; locale: Locale }) {
  const copy = HOME[locale];
  const words = PRODUCT[locale];
  const tiers: ReadonlyArray<{ tier: Tier; label: string; latin: string; tone: string }> = [
    { tier: 'top', label: words.topNotes, latin: 'Top', tone: 'bg-note-top' },
    { tier: 'heart', label: words.heartNotes, latin: 'Heart', tone: 'bg-note-heart' },
    { tier: 'base', label: words.baseNotes, latin: 'Base', tone: 'bg-note-base' },
  ];

  return (
    <div className="note-organ -mt-7 lg:-mt-8">
      {tiers.filter(({ tier }) => index[tier].length > 0).map(({ tier, label, latin, tone }) => (
        <div key={tier} className="grid gap-3 border-b border-line py-5 lg:grid-cols-[220px_1fr] lg:items-center lg:gap-8 lg:py-7">
          <h3 className="flex items-baseline gap-3">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 self-center ${tone}`} />
            <span className="font-display text-h4 leading-heading lg:text-h3">{label}</span>
            {/* The English title IS the Latin word; printing it twice would stutter. */}
            {locale !== 'en' && <span lang="en" className="latin text-micro uppercase tracking-label text-ink3">{latin}</span>}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {index[tier].map((entry) => {
              const shown = locale === 'en' && entry.en ? { text: entry.en, lang: 'en' as const } : { text: entry.note, lang: 'ar' as const };
              return (
                <li key={entry.note}>
                  <NoteChip
                    note={entry.note}
                    shown={shown}
                    icon={entry.icon}
                    locale={locale}
                    label={`${copy.searchFor(shown.text)} (${num(entry.count)})`}
                    count={num(entry.count)}
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
