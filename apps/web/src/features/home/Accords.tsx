import Link from 'next/link';
import type { Route } from 'next';
import { glassPalette, withAlpha } from '@diyar/tokens';
import { countedIn, editorialIn, NOUN, SCENT_FAMILY, labelOf, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { Reveal } from '@/features/shell/Reveal';

export interface FamilyCount {
  readonly family: string;
  readonly count: number;
}

/**
 * LES ACCORDS — the scent families as a rack of filled vials (identity v3,
 * 16 Nov 2026).
 *
 * The one place on the home page where colour is allowed to be large. The
 * family colours are data (law IV: "for data visualisation only, never for
 * chrome") and this is the datum itself: each vial is a family, filled with
 * that family's colour as liquid — dark where the eye looks through its full
 * depth, lit at the core (`glassPalette`) — and its level is how much of the
 * catalogue is in it, so a family with one perfume stands lower than a family
 * with five. Under the pointer the liquid stirs once.
 *
 * ONLY FAMILIES WITH A PERFUME. A vial for a family nobody sells would be a
 * link to an empty page and a picture of a fact the catalogue does not hold.
 *
 * Each vial is a search — `/search?family=…`, the same link the masthead's
 * panel carries — so there is one behaviour, reached two ways.
 */
export function Accords({ families, locale }: { families: readonly FamilyCount[]; locale: Locale }) {
  const most = Math.max(...families.map((f) => f.count), 1);
  const say = editorialIn(locale);
  return (
    <ul className="accords flex snap-x gap-3 overflow-x-auto pb-2 lg:gap-4 lg:overflow-visible lg:pb-0">
      {families.map(({ family, count }, i) => {
        const glass = glassPalette(family);
        // The fullest family fills to 62% of the vial; the rest in proportion, never below 30%.
        // The words stand in the empty glass above the line, never on the colour.
        const level = 30 + Math.round((count / most) * 32);
        return (
          <Reveal as="li" key={family} delay={Math.min(i, 6) * 70} className="accord min-w-[148px] flex-1 snap-start">
            <Link
              href={localeHref(locale, `/search?family=${family}`) as Route}
              className="accord-vial group relative flex h-[300px] flex-col overflow-hidden border border-line bg-raised p-4 transition-colors duration-base ease-out hover:border-ink lg:h-[400px] lg:p-5"
              style={{
                ['--accord-edge' as string]: glass.deep,
                ['--accord-core' as string]: glass.core,
                ['--accord-light' as string]: withAlpha(glass.mist, 0.55),
                ['--accord-level' as string]: `${level}%`,
              }}
            >
              <span aria-hidden="true" className="accord-liquid" />
              <span className="relative">
                <span lang="en" className="latin block text-micro uppercase tracking-label text-ink3 lg:text-caption">{family}</span>
                <span className="mt-1 block font-display text-h4 leading-heading transition-colors duration-base ease-out group-hover:text-accent lg:text-h3Lg">
                  {labelOf(SCENT_FAMILY, locale, family)}
                </span>
                <span className="mt-1 block text-small text-ink2 lg:text-body">{countedIn(locale, count, NOUN.perfume, say)}</span>
              </span>
            </Link>
          </Reveal>
        );
      })}
    </ul>
  );
}
