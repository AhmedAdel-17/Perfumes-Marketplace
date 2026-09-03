'use client';

import { useId } from 'react';

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

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-caption tracking-label text-dim">
        {label}
        {!required && <span className="text-faint"> — اختياري</span>}
      </label>

      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        // 52px, the control height — a 40px input is the single most common
        // reason a checkout feels cheap on a phone.
        className={[
          'h-control w-full rounded-sm border bg-l1 px-4 text-bodyLg text-bone',
          'transition-colors duration-base ease-out',
          'placeholder:text-faint focus:outline-none focus-visible:border-brass',
          error ? 'border-[#B5697E]' : 'border-hair focus:border-dim',
        ].join(' ')}
      />

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-caption text-[#B5697E]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-caption text-faint">
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
      <label htmlFor={id} className="mb-2 block text-caption tracking-label text-dim">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-control w-full rounded-sm border border-hair bg-l1 px-4 text-bodyLg text-bone transition-colors duration-base ease-out focus:border-dim focus:outline-none focus-visible:border-brass"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-l1 text-bone">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
