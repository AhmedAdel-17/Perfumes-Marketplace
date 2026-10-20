import Link from 'next/link';
import { Icon } from '@diyar/ui';
import type { NoteIcon } from '@diyar/domain';
import { langAttrs, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';

/**
 * Which drawing each glossary icon key prints. Typed as a complete record, so a
 * key added to NOTE_ICONS without a drawing here is a compile error, not a
 * blank chip.
 */
const DRAWING: Record<NoteIcon, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  bergamot: Icon.Bergamot,
  citrus: Icon.Citrus,
  cardamom: Icon.Cardamom,
  saffron: Icon.Saffron,
  jasmine: Icon.Jasmine,
  white_flower: Icon.Jasmine2,
  rose: Icon.Rose,
  violet: Icon.Violet,
  bloom: Icon.Bloom,
  leaf: Icon.Leaf,
  sprig: Icon.Sprig,
  palm: Icon.Palm,
  wood: Icon.Wood,
  oud: Icon.Oud,
  amber: Icon.Amber,
  musk: Icon.Musk,
  vanilla: Icon.Vanilla,
  incense: Icon.Bakhoor2,
  cool: Icon.Snowflake,
};

/**
 * A note's drawing: the one the glossary assigns, or the house's diamond.
 * `x`, `y`, `width` and `height` place it inside another drawing — a bead on
 * the day-on-the-skin dial — where an SVG nested without them fills its parent.
 */
export function NoteIconMark({ icon, className = '', ...place }: { icon: NoteIcon | null; className?: string }
  & Pick<React.SVGProps<SVGSVGElement>, 'x' | 'y' | 'width' | 'height'>) {
  const Drawing = icon ? DRAWING[icon] : Icon.Diamond;
  return <Drawing aria-hidden="true" className={className} {...place} />;
}

/**
 * One scent note as a chip: its drawing, its name, and — on the home page's
 * index — how many perfumes carry it. Every chip is a search for the note as
 * the house wrote it, because search already matches notes.
 *
 * ONE chip for the home page and the product page (17 Oct 2026), so a note
 * looks the same wherever it is printed. The drawing is the accent at rest and
 * turns with the chip — a few degrees, slowly — when it inverts under the
 * pointer.
 */
export function NoteChip({
  note, shown, icon, locale, label, count,
}: {
  /** The note exactly as the house wrote it: the search query. */
  note: string;
  /** What the visitor reads: the English name on the English site when there is one. */
  shown: { text: string; lang: 'ar' | 'en' };
  icon: NoteIcon | null;
  locale: Locale;
  /** The accessible name: what pressing it does. */
  label: string;
  count?: string;
}) {
  return (
    <Link
      href={localeHref(locale, `/search?q=${encodeURIComponent(note)}`)}
      aria-label={label}
      className={[
        'group inline-flex h-touch items-center gap-2.5 border border-line bg-raised ps-3.5 pe-4 text-body lg:text-bodyLg',
        'transition-colors duration-quick ease-out hover:border-ink hover:bg-ink hover:text-ground',
      ].join(' ')}
    >
      <NoteIconMark
        icon={icon}
        className={[
          'h-[19px] w-[19px] shrink-0 text-accent',
          'transition-[color,transform] duration-slow ease-out group-hover:-rotate-[8deg] group-hover:scale-110 group-hover:text-ground',
        ].join(' ')}
      />
      <span {...langAttrs(locale, shown.lang)}>{shown.text}</span>
      {count !== undefined && (
        <span className="latin text-caption text-ink3 tnum group-hover:text-ground">{count}</span>
      )}
    </Link>
  );
}
