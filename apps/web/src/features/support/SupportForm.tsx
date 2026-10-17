'use client';

import { useState } from 'react';
import { MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, type SupportCategory } from '@diyar/domain';
import { CONTACT, SUPPORT_CATEGORY, TICKET_STATUS } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { Field } from '@/features/checkout/Field';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { findTicket, openTicket, type TicketResult } from './actions';
import { Pending } from '@/features/shell/FlaconLoader';

/**
 * The way to reach a person.
 *
 * There has been none on this site — no form, no address, no number — on a
 * marketplace that asks people to pay cash at the door for a bottle they cannot
 * smell first. This is the screen that answers "and if something goes wrong?"
 * before it is asked.
 *
 * THE ORDER NUMBER IS OPTIONAL AND SAYS SO. Somebody asking whether we deliver
 * to Aswan has no order number, and a required field would turn a pre-sale
 * question into a lost sale. It is also the commonest thing a support form gets
 * wrong.
 *
 * The reference on the confirmation is SELECTABLE and set large, because it is
 * the only thing the customer has to keep, and the next thing they will do is
 * screenshot it.
 */
export function SupportForm() {
  const [category, setCategory] = useState<SupportCategory>('order_status');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const locale = useLocale();
  const copy = CONTACT[locale];

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    const result = await openTicket({
      category, subject, message, contactName: name, contactPhone: phone, orderReference,
    });
    setSending(false);

    if (result.ok) setSent(result.reference);
    else setError(result.message);
  };

  if (sent) {
    return (
      <div className="px-5 lg:px-0">
        <div className="border border-ink bg-raised p-5">
          {/* No tracking: Arabic on the Arabic site (CLAUDE.md §15). */}
          <div className="text-body text-ink2">{copy.reference}</div>
          <div className="latin mt-2 select-all text-h3 tracking-[3px] text-accent lg:text-h2Lg">
            {sent}
          </div>
          <p className="mt-3 max-w-proseMax text-body leading-relaxed text-ink2">
            {copy.keepReference}{' '}
            <span className="latin tnum">{phone}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setSent(null); setSubject(''); setMessage(''); }}
          className="tappable mt-7 inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
        >
          <span className="link-line">{copy.sendAnother}</span>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="px-5 lg:px-0">
      <fieldset className="mb-6">
        {/* No tracking: Arabic on the Arabic site (CLAUDE.md §15). */}
        <legend className="mb-3 text-body text-ink2">{copy.topic}</legend>

        {/*
          Radios, not a select. Eight options is a list somebody can read in one
          glance, and the choice sets the priority of the ticket — burying it in
          a dropdown makes the most consequential field on the form the least
          visible one.
        */}
        <div className="grid gap-x-6 sm:grid-cols-2">
          {SUPPORT_CATEGORIES.map((option) => (
            <label
              key={option}
              className="tappable flex min-h-touch cursor-pointer items-center gap-3 py-1"
            >
              <input
                type="radio"
                name="category"
                value={option}
                checked={category === option}
                onChange={() => setCategory(option)}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-body text-ink">{SUPPORT_CATEGORY[locale][option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={copy.name} value={name} onChange={setName} required maxLength={80} />
      <Field
        label={copy.phone} value={phone} onChange={setPhone} required
        type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
        hint={copy.phoneHint}
      />
      <Field
        label={copy.orderReference} value={orderReference} onChange={setOrderReference}
        maxLength={20}
        // Said plainly, because a form that looks like it needs an order number
        // loses the person who does not have one yet.
        hint={copy.orderReferenceHint}
      />
      <Field label={copy.subject} value={subject} onChange={setSubject} required maxLength={SUBJECT_MAX} />

      <label className="mb-5 block">
        <span className="text-body text-ink2">{copy.message}</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
          rows={6}
          maxLength={MESSAGE_MAX}
          required
          className="mt-2 block w-full resize-y border border-line bg-sunken p-3 text-body leading-relaxed text-ink outline-none transition-colors duration-base ease-out focus:border-ink focus-visible:border-accent"
        />
        {/* `dir="ltr"` isolates the counter: in an RTL paragraph "2000/40"
            reorders and renders as "40/2000". */}
        <span dir="ltr" className="tnum mt-1 block text-end text-small text-ink3">
          {message.length}/{MESSAGE_MAX}
        </span>
      </label>

      {error && (
        <p role="alert" className="mb-5 border border-danger bg-raised p-4 text-body leading-relaxed text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={sending} fill="full">
        {sending ? <Pending label={copy.sending} /> : copy.send}
      </PrimaryButton>
    </form>
  );
}

/** Looking a message up again, with the reference and the phone. */
export function TicketLookup() {
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ticket, setTicket] = useState<TicketResult>(null);
  const locale = useLocale();
  const copy = CONTACT[locale];

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (searching) return;
    setSearching(true);
    setTicket(await findTicket(reference, phone));
    setSearched(true);
    setSearching(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="px-5 lg:px-0">
      <Field label={copy.reference} value={reference} onChange={setReference} required maxLength={20} hint={copy.referenceHint} />
      {/*
        "الذي أرسلت به", not just "رقم الموبايل".

        This page carries two forms, and both need a phone number. With the same
        label on each, a screen reader announces "رقم الموبايل" twice with
        nothing to tell them apart, and a sighted person filling the second form
        has to remember which number the first one wanted. Naming it after what
        it is FOR fixes both — and it caught a browser test that had been
        filling the wrong field and passing.
      */}
      <Field
        label={copy.phoneYouUsed} value={phone} onChange={setPhone} required
        type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
      />

      {searched && !ticket && (
        // The same message for a wrong phone and an unknown reference. Telling
        // them apart says which half somebody got right.
        <p role="alert" className="mb-5 border border-danger bg-raised p-4 text-body leading-relaxed text-ink">
          {copy.notFound}
        </p>
      )}

      {ticket && (
        <div className="mb-6 border border-ink bg-raised p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-body text-ink">{ticket.subject}</span>
            <span className="text-small text-accent">
              {TICKET_STATUS[locale][ticket.status as keyof (typeof TICKET_STATUS)['ar']] ?? ticket.status}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-line text-body leading-relaxed text-ink2">
            {ticket.message}
          </p>
          {ticket.nextAction && (
            <p className="mt-4 border-t border-line pt-3 text-body leading-relaxed text-ink">
              {ticket.nextAction}
            </p>
          )}
        </div>
      )}

      <PrimaryButton type="submit" disabled={searching} fill="full">
        {searching ? <Pending label={copy.searching} /> : copy.find}
      </PrimaryButton>
    </form>
  );
}
