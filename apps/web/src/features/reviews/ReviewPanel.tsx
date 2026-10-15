'use client';

import { useEffect, useState } from 'react';
import {
  REVIEW_BODY_MAX, REVIEW_DIMENSIONS, type Ratings, type ReviewDimension,
} from '@diyar/domain';
import {
  langAttrs, languageOf, REVIEW_DIMENSION, REVIEW_DIMENSION_PROMPT, REVIEWS, data as num,
} from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { RatingInput } from './RatingInput';
import { reviewableItems, submitReview, type ReviewableItem } from './actions';

/**
 * Writing a review, from the screen where the customer already is.
 *
 * NOT ITS OWN ROUTE. A review needs the order reference and the phone, and a
 * page reached by a link would either have neither — sending the customer back
 * through the same two-factor form they just filled in — or carry both in the
 * URL, where they end up in browser history, in a shared screenshot and in
 * every analytics tool that records paths. It belongs here, under the order it
 * is about.
 *
 * It renders NOTHING until there is something delivered to review, so an order
 * still in transit is not offered a form it cannot submit.
 */
export function ReviewPanel({ reference, phone }: { reference: string; phone: string }) {
  const [items, setItems] = useState<ReviewableItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const locale = useLocale();

  useEffect(() => {
    let live = true;
    void reviewableItems(reference, phone).then((rows) => {
      if (live) setItems(rows);
    });
    // Cancelled on unmount so a slow response cannot set state on a component
    // the customer has already navigated away from.
    return () => { live = false; };
  }, [reference, phone]);

  // Null while loading, empty when nothing has arrived yet. Both render
  // nothing: a heading followed by a spinner on a tracking page is noise
  // attached to the one screen somebody is anxiously refreshing.
  if (items === null || items.length === 0) return null;

  const unreviewed = items.filter((item) => !item.reviewed);
  const copy = REVIEWS[locale];

  return (
    <section className="mt-8 border-t border-ink pt-6">
      <h2 className="font-display text-h4 lg:text-h3">{copy.rateWhatArrived}</h2>
      <p className="mt-2 max-w-proseMax text-body leading-relaxed text-ink2">
        {unreviewed.length === 0
          ? copy.allReviewed
          : copy.howShown}
      </p>

      <ul className="mt-4">
        {items.map((item) => (
          <li key={item.lineItemId} className="border-t border-line py-4 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <div>
                <div {...langAttrs(locale, languageOf(item.productName))} className="text-body text-ink">{item.productName}</div>
                <div className="text-small text-ink3">
                  {item.brandName} · <span className="tnum">{num(item.volumeMl)}</span> {copy.ml}
                </div>
              </div>

              {item.reviewed ? (
                <span className="text-small text-accent">{copy.reviewed}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(open === item.lineItemId ? null : item.lineItemId)}
                  aria-expanded={open === item.lineItemId}
                  className="tappable inline-flex min-h-touch items-center text-body text-ink transition-colors duration-base ease-out hover:text-accent"
                >
                  <span className="border-b border-current">{open === item.lineItemId ? copy.close : copy.write}</span>
                </button>
              )}
            </div>

            {open === item.lineItemId && (
              <ReviewForm
                reference={reference}
                phone={phone}
                item={item}
                onDone={() => {
                  setOpen(null);
                  setItems((current) => (current ?? []).map((row) => (
                    row.lineItemId === item.lineItemId ? { ...row, reviewed: true } : row
                  )));
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every dimension unanswered. A review is not partially submittable. */
const BLANK: Readonly<Record<ReviewDimension, number | null>> = {
  scent: null, longevity: null, projection: null,
  value: null, packaging: null, descriptionAccuracy: null,
};

function ReviewForm({
  reference, phone, item, onDone,
}: {
  reference: string;
  phone: string;
  item: ReviewableItem;
  onDone(): void;
}) {
  const [scores, setScores] = useState<Record<ReviewDimension, number | null>>(BLANK);
  const [body, setBody] = useState('');
  const [incentive, setIncentive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const copy = REVIEWS[locale];

  const missing = REVIEW_DIMENSIONS.filter((d) => scores[d] === null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || missing.length > 0) return;

    setSaving(true);
    setError(null);

    const result = await submitReview({
      reference,
      phone,
      lineItemId: item.lineItemId,
      // Safe by the guard above: `missing` is empty, so every dimension holds a
      // number. Asserted rather than defaulted — a `?? 3` here would silently
      // submit a score the customer never gave.
      ratings: Object.fromEntries(
        REVIEW_DIMENSIONS.map((d) => [d, scores[d]!]),
      ) as unknown as Ratings,
      body,
      incentiveDisclosed: incentive,
    });

    setSaving(false);
    if (result.ok) onDone();
    else setError(result.message);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 border border-ink bg-raised p-4 lg:p-5">
      {REVIEW_DIMENSIONS.map((dimension) => (
        <RatingInput
          key={dimension}
          label={REVIEW_DIMENSION[locale][dimension]}
          prompt={REVIEW_DIMENSION_PROMPT[locale][dimension]}
          value={scores[dimension]}
          onChange={(value) => setScores((current) => ({ ...current, [dimension]: value }))}
        />
      ))}

      <label className="mt-5 block">
        {/* No tracking: Arabic on the Arabic site (CLAUDE.md §15). */}
        <span className="text-body text-ink2">
          {copy.yourWords}
        </span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, REVIEW_BODY_MAX))}
          rows={4}
          maxLength={REVIEW_BODY_MAX}
          className="mt-2 block w-full resize-y border border-line bg-sunken p-3 text-body leading-relaxed text-ink outline-none transition-colors duration-base ease-out focus:border-ink focus-visible:border-accent"
        />
        {/*
          `dir="ltr"` isolates the counter. In an RTL paragraph "1200/160"
          reorders and renders as "160/1200" — the listing editor's counter
          shipped reading "160/0" for exactly this reason.
        */}
        <span dir="ltr" className="tnum mt-1 block text-end text-small text-ink3">
          {body.length}/{REVIEW_BODY_MAX}
        </span>
      </label>

      {/*
        Doc 06 §10: reviews disclose incentives, samples or promotional
        consideration. ASKED, because we cannot detect it — and a disclosure
        field that is never true is a field nobody was ever offered.
      */}
      <label className="tappable mt-2 flex min-h-touch items-start gap-3">
        <input
          type="checkbox"
          checked={incentive}
          onChange={(event) => setIncentive(event.target.checked)}
          className="mt-1 h-4 w-4 accent-accent"
        />
        <span className="text-body leading-relaxed text-ink2">
          {copy.incentive}
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 border border-danger bg-ground p-3 text-body leading-relaxed text-danger">
          {error}
        </p>
      )}

      {/*
        The button says WHY it is disabled rather than sitting inert.

        A greyed-out submit with no explanation is the commonest way a form
        traps somebody: they have answered five of six, the sixth is above the
        fold they scrolled past, and nothing on screen says so.
      */}
      <div className="mt-5">
        <PrimaryButton type="submit" disabled={saving || missing.length > 0} fill="full">
          {saving ? copy.saving : copy.submit}
        </PrimaryButton>
        {missing.length > 0 && (
          <p className="mt-2 text-small text-ink3">
            {copy.remaining(missing.map((d) => REVIEW_DIMENSION[locale][d]).join(copy.listSeparator))}
          </p>
        )}
      </div>
    </form>
  );
}
