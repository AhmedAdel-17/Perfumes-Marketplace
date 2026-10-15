import Link from 'next/link';
import type { IndexedNote } from '@diyar/api';
import { data as num, HOME, langAttrs, PRODUCT, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';

type Tier = 'top' | 'heart' | 'base';

/**
 * Search by the note, not the brand (identity v2 — `.tiers` in
 * 04-laboratoire.html): the notes the published catalogue carries, tier by
 * tier, each with how many perfumes carry it.
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
  const tiers: ReadonlyArray<{ tier: Tier; label: string }> = [
    { tier: 'top', label: words.topNotes },
    { tier: 'heart', label: words.heartNotes },
    { tier: 'base', label: words.baseNotes },
  ];

  return (
    <div className="grid gap-7 lg:grid-cols-3">
      {tiers.filter(({ tier }) => index[tier].length > 0).map(({ tier, label }) => (
        <div key={tier}>
          <h3
            className={`mb-4 border-b border-line pb-2 text-accent ${
              locale === 'en' ? 'latin text-caption uppercase tracking-label' : 'text-small'
            }`}
          >
            {label}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {index[tier].map((entry) => {
              const shown = locale === 'en' && entry.en ? { text: entry.en, lang: 'en' as const } : { text: entry.note, lang: 'ar' as const };
              return (
                <li key={entry.note}>
                  <Link
                    href={localeHref(locale, `/search?q=${encodeURIComponent(entry.note)}`)}
                    aria-label={`${copy.searchFor(shown.text)} (${num(entry.count)})`}
                    className="group inline-flex h-touch items-center gap-2 border border-line bg-raised px-4 text-body transition-colors duration-quick ease-out hover:border-ink hover:bg-ink hover:text-ground lg:text-bodyLg"
                  >
                    <span {...langAttrs(locale, shown.lang)}>{shown.text}</span>
                    <span className="latin text-caption text-ink3 tnum group-hover:text-ground">{num(entry.count)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
