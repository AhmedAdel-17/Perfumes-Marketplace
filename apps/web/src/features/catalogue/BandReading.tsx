import { BAND_AR, BAND_EN, labelOf, PERFORMANCE_SOURCE, type Locale } from '@diyar/i18n';
import type { PerformanceReading } from '@/core/catalogue';

/**
 * A performance band the way a specimen label prints it: the band, a segmented
 * meter, and — always — where the reading came from.
 *
 * The source line is not optional and has no prop to hide it. Doc 06 §4 and
 * CLAUDE.md §4: a band without its source presents a house's claim as the
 * platform's fact.
 *
 * FOUR segments, not the reference's five, because each vocabulary has four
 * bands. A fifth segment would draw a level nobody can be measured at, and a
 * meter that can never be full reads as a perfume that falls short.
 *
 * The meter fills from the reading START — right in Arabic, left in English —
 * because it is a flex row in document order (CLAUDE.md §14).
 */
const SCALES = {
  longevity: ['weak', 'moderate', 'long', 'very_long'],
  projection: ['intimate', 'moderate', 'strong', 'enormous'],
} as const;

export function BandReading({
  reading, locale, kind, meter = true,
}: {
  reading: PerformanceReading;
  locale: Locale;
  /** Which vocabulary the band belongs to — the two share `moderate`. */
  kind: keyof typeof SCALES;
  /** The meter, where there is room for it. The words and the source are always shown. */
  meter?: boolean;
}) {
  const scale: readonly string[] = SCALES[kind];
  const band = reading.band as keyof typeof BAND_AR;
  const level = scale.indexOf(reading.band) + 1;
  return (
    <>
      {locale === 'ar' ? (
        <span>{BAND_AR[band] ?? reading.band}</span>
      ) : (
        <span className="latin text-caption tracking-label">{BAND_EN[band] ?? reading.band.toUpperCase()}</span>
      )}
      {meter && level > 0 && (
        <span className="mt-1.5 flex gap-[3px]" aria-hidden="true">
          {scale.map((step, i) => (
            <i key={step} className={`h-[5px] flex-1 ${i < level ? 'bg-ink' : 'bg-line'}`} />
          ))}
        </span>
      )}
      <span className="mt-1 block text-small text-accent">
        {labelOf(PERFORMANCE_SOURCE, locale, reading.source)}
      </span>
    </>
  );
}
