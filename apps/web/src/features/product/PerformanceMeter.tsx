/**
 * A performance band with its source.
 *
 * Doc 06 §4: performance descriptions use defined bands and must disclose
 * whether they came from the seller, a platform test, or aggregated reviews.
 * The source line is not decoration — it is what stops a seller claim being
 * read as platform fact, so it renders whenever a band does.
 *
 * The meter fills from the RIGHT, because in RTL that is where reading starts.
 */
export function PerformanceMeter({
  label, band,
}: {
  label: string;
  band: { ar: string; en: string; fill: number; source: string };
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-small text-ink2">{label}</span>
        <span className="latin text-micro tracking-label text-accent">{band.en}</span>
      </div>
      <div className="relative h-[2px] bg-line">
        <div
          className="absolute inset-block-0 bg-accent"
          style={{ insetInlineStart: 0, width: `${band.fill}%`, top: 0, bottom: 0 }}
        />
      </div>
      <div className="mt-2 text-micro text-ink3">{band.source}</div>
    </div>
  );
}
