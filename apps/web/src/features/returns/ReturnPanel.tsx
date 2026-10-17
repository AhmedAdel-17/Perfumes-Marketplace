'use client';

import { useEffect, useState } from 'react';
import type { ReturnReason } from '@diyar/domain';
import {
  CURRENCY_LABEL, langAttrs, languageOf, RETURN_REASON, RETURN_REASON_DETAIL, RETURN_STATE, RETURNS,
  data as num, formatPrice,
} from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import {
  requestReturn, returnableItems,
  type ExistingReturn, type ReturnableItem,
} from './actions';

/**
 * Asking to send something back.
 *
 * Under the order it is about, for the same reason the review panel is: a
 * return needs the reference and the phone, and a page reached by a link would
 * either ask for both again or carry them in a URL that ends up in a shared
 * screenshot.
 *
 * WHAT IT OFFERS IS DECIDED ON THE SERVER. The reasons in this list are the ones
 * still inside their own window for this particular listing — a change of mind
 * expires at fourteen days and a fault at thirty, so on day twenty this screen
 * offers four reasons rather than five. Deciding that here would put the returns
 * policy in a place an attacker can edit, and would put it in two places even if
 * they could not.
 */
export function ReturnPanel({ reference, phone }: { reference: string; phone: string }) {
  const [items, setItems] = useState<ReturnableItem[] | null>(null);
  const [existing, setExisting] = useState<ExistingReturn[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const locale = useLocale();
  const copy = RETURNS[locale];

  const load = async () => {
    const result = await returnableItems(reference, phone);
    setItems(result.items);
    setExisting(result.existing);
  };

  useEffect(() => {
    let live = true;
    void returnableItems(reference, phone).then((result) => {
      if (!live) return;
      setItems(result.items);
      setExisting(result.existing);
    });
    return () => { live = false; };
  }, [reference, phone]);

  if (items === null) return null;

  // Only what has arrived and has something left to ask for. A parcel still on
  // a van is shown by the timeline above; repeating it here as "you cannot
  // return this yet" is noise on a screen somebody is anxiously refreshing.
  const returnable = items.filter((i) => i.delivered && !i.alreadyRequested && i.reasons.length > 0);
  if (returnable.length === 0 && existing.length === 0) return null;

  return (
    <section className="mt-8 border-t border-ink pt-6">
      <h2 className="font-display text-h4 lg:text-h3">{copy.heading}</h2>

      {existing.length > 0 && (
        <ul className="mt-4">
          {existing.map((row) => (
            <li key={row.id} className="border border-line bg-raised p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span {...langAttrs(locale, languageOf(row.productName ?? row.brandName))} className="text-body text-ink">{row.productName ?? row.brandName}</span>
                <span className="text-small text-accent">
                  {RETURN_STATE[locale][row.state as keyof (typeof RETURN_STATE)['ar']] ?? row.state}
                </span>
              </div>
              <p className="mt-1 text-small text-ink3">
                {RETURN_REASON[locale][row.reason as ReturnReason] ?? row.reason}
              </p>
              {row.refundPiastres !== null && (
                <p className="mt-2 text-small text-ink2">
                  {copy.refunded}{' '}
                  <span className="tnum">{formatPrice(row.refundPiastres)}</span>
                  <span className="latin ms-1.5 text-micro tracking-label">{CURRENCY_LABEL}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {returnable.length > 0 && (
        <>
          <p className="mt-4 max-w-proseMax text-body leading-relaxed text-ink2">
            {copy.houseReviews}
          </p>

          <ul className="mt-3">
            {returnable.map((item) => (
              <li key={item.lineItemId} className="border-t border-line py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div>
                    <div {...langAttrs(locale, languageOf(item.productName))} className="text-body text-ink">{item.productName}</div>
                    <div className="text-small text-ink3">
                      {item.brandName} · <span className="tnum">{num(item.volumeMl)}</span> {copy.ml}
                      {item.daysLeft !== null && item.daysLeft > 0 && (
                        <> · {copy.daysLeft(num(item.daysLeft), item.daysLeft === 1)}</>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen(open === item.lineItemId ? null : item.lineItemId)}
                    aria-expanded={open === item.lineItemId}
                    className="tappable inline-flex min-h-touch items-center text-body text-ink transition-colors duration-base ease-out hover:text-accent"
                  >
                    <span className="link-line">{open === item.lineItemId ? copy.close : copy.request}</span>
                  </button>
                </div>

                {open === item.lineItemId && (
                  <ReturnForm
                    reference={reference}
                    phone={phone}
                    item={item}
                    onDone={async () => { setOpen(null); await load(); }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ReturnForm({
  reference, phone, item, onDone,
}: {
  reference: string;
  phone: string;
  item: ReturnableItem;
  onDone(): Promise<void>;
}) {
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const copy = RETURNS[locale];

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || reason === null || note.trim().length === 0) return;

    setSaving(true);
    setError(null);
    const result = await requestReturn({ reference, phone, lineItemId: item.lineItemId, reason, note });
    setSaving(false);

    if (result.ok) await onDone();
    else setError(result.message);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 border border-ink bg-raised p-4 lg:p-5">
      <fieldset>
        {/* No tracking: Arabic on the Arabic site (CLAUDE.md §15). */}
        <legend className="text-body text-ink2">{copy.whatIsWrong}</legend>

        <div className="mt-2">
          {/*
            Radios, not a select. Each reason carries a line saying what happens
            next — a change of mind is at the customer's expense and a defect is
            not — and that sentence is what stops the wrong one being picked.
            A dropdown hides it until after the choice.
          */}
          {item.reasons.map((option) => (
            <label
              key={option}
              className="tappable flex min-h-touch cursor-pointer items-start gap-3 border-t border-line py-3 first:border-t-0"
            >
              <input
                type="radio"
                name={`reason-${item.lineItemId}`}
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
                className="mt-1 h-4 w-4 accent-accent"
              />
              <span>
                <span className="block text-body text-ink">{RETURN_REASON[locale][option]}</span>
                <span className="block text-small leading-relaxed text-ink3">
                  {RETURN_REASON_DETAIL[locale][option]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-body text-ink2">{copy.explain}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 1_000))}
          rows={3}
          maxLength={1_000}
          required
          className="mt-2 block w-full resize-y border border-line bg-sunken p-3 text-body leading-relaxed text-ink outline-none transition-colors duration-base ease-out focus:border-ink focus-visible:border-accent"
        />
        {/*
          The note is required by the router and by the domain, and this line
          says why rather than just insisting. Somebody has to collect the
          bottle and look at it.
        */}
        <span className="mt-1 block text-small leading-relaxed text-ink3">
          {copy.houseReads}
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 border border-danger bg-ground p-3 text-body leading-relaxed text-danger">
          {error}
        </p>
      )}

      <div className="mt-5">
        <PrimaryButton
          type="submit"
          fill="full"
          disabled={saving || reason === null || note.trim().length === 0}
        >
          {saving ? copy.sending : copy.send}
        </PrimaryButton>
        {(reason === null || note.trim().length === 0) && (
          <p className="mt-2 text-small text-ink3">
            {reason === null ? copy.chooseReason : copy.writeLine}
          </p>
        )}
      </div>
    </form>
  );
}
