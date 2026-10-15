'use client';

import { useId } from 'react';
import { CHECKOUT, westernDigits } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';

/**
 * One form field.
 *
 * The label is a real `<label>` bound by id, never a placeholder standing in
 * for one. A placeholder disappears the moment someone types, so a customer
 * checking their own address before paying cannot see what any of the boxes
 * were for — and on a phone, mid-checkout, that is where orders are abandoned.
 *
 * The error is tied to the input with `aria-describedby` and announced, because
 * a red border communicates nothing to a screen reader and nothing at all to
 * someone who cannot distinguish it.
 */
export function Field({
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  type?: 'text' | 'tel';
  inputMode?: 'text' | 'tel' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  /**
   * Whether this field holds digits as DATA rather than prose.
   *
   * An Egyptian keyboard produces ٠١٢…, and every validator downstream — the
   * phone regex, the one-time code, the quantity — reads Western digits only.
   * So a customer typing their own phone number in their own numerals was told
   * it was not a valid Egyptian mobile, with nothing on screen to say what was
   * wrong with it. On the market this product is built for, that is not an edge
   * case; it is a keyboard layout.
   *
   * The decision is made HERE, once, rather than at each of the five call
   * sites, and it is keyed off `inputMode` because that prop already declares
   * exactly this distinction: `tel` and `numeric` mean digits, `text` means
   * prose, and a name or a street must keep whatever numerals it was given.
   */
  const digitsAsData = inputMode === 'tel' || inputMode === 'numeric';
  const optional = CHECKOUT[useLocale()].optional;

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-body text-ink2">
        {label}
        {!required && <span className="text-ink3">{optional}</span>}
      </label>

      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(
          // A `tel` or `numeric` field holds DIGITS AS DATA, so whatever
          // numerals were typed become Western here. See below.
          digitsAsData ? westernDigits(event.target.value) : event.target.value,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        // 52px, the control height — a 40px input is the single most common
        // reason a checkout feels cheap on a phone.
        // Identity v2: a field cut into the paper — the `sunken` well, square,
        // a hairline that turns to ink on focus.
        className={[
          'h-control w-full border bg-sunken px-4 text-bodyLg text-ink',
          'transition-colors duration-base ease-out',
          'placeholder:text-ink3 focus:outline-none',
          error ? 'border-danger' : 'border-line focus:border-ink',
        ].join(' ')}
      />

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-small text-ink3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The governorate picker. Same shape as `Field`, so the form reads uniformly. */
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-body text-ink2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-control w-full border border-line bg-sunken px-4 text-bodyLg text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-sunken text-ink">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
