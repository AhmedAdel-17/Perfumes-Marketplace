/**
 * A performance band with its source.
 *
 * Doc 06 §4: performance descriptions use defined bands and must disclose
 * whether they came from the seller, a platform test, or aggregated reviews.
 * The source line is not decoration — it is what stops a seller claim being
 * read as platform fact, so it renders whenever a band does.
 *
 * The meter fills from the reading START — the right in Arabic, the left in
 * English — because its bar is anchored with a logical property.
 */
import { BAND_EN, labelOf, PERFORMANCE_SOURCE, type Locale } from '@diyar/i18n';
import type { PerformanceReading } from '@/core/catalogue';

export function PerformanceMeter({
  label, band, locale,
}: {
  label: string;
  band: PerformanceReading;
  locale: Locale;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-small text-ink2">{label}</span>
        <span className="latin text-micro tracking-label text-accent">{BAND_EN[band.band as keyof typeof BAND_EN] ?? band.band.toUpperCase()}</span>
      </div>
      <div className="relative h-[2px] bg-line">
        <div
          className="absolute inset-block-0 bg-accent"
          style={{ insetInlineStart: 0, width: `${band.fill}%`, top: 0, bottom: 0 }}
        />
      </div>
      <div className="mt-2 text-micro text-ink3">{labelOf(PERFORMANCE_SOURCE, locale, band.source)}</div>
    </div>
  );
}
