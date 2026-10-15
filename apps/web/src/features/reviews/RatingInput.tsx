'use client';

import { useId } from 'react';
import { data as num } from '@diyar/i18n';

/**
 * One dimension, scored 1 to 5.
 *
 * REAL RADIO INPUTS, visually replaced. Not five `<button>`s with `aria-*`
 * attributes bolted on: a radio group gives arrow-key navigation, a single tab
 * stop, and the right announcement in every screen reader, for free and
 * correctly. Re-implementing that with buttons is how a form becomes unusable
 * for the people most likely to need the keyboard.
 *
 * The marks are dashes rather than stars — see `Ratings.tsx` for why this shop
 * does not use stars — and each sits inside a 44px target because a control
 * that needs a precise tap is a control that gets the wrong answer.
 */
export function RatingInput({
  label,
  prompt,
  value,
  onChange,
}: {
  label: string;
  prompt: string;
  value: number | null;
  onChange(value: number): void;
}) {
  const name = useId();

  return (
    <fieldset className="border-t border-line py-4">
      <legend className="sr-only">{label}</legend>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span aria-hidden="true" className="text-body text-ink">{label}</span>
        <span className="text-small text-ink3">{prompt}</span>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((score) => {
          const id = `${name}-${score}`;
          const filled = value !== null && score <= value;

          return (
            <span key={score} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={score}
                checked={value === score}
                onChange={() => onChange(score)}
                // `sr-only` rather than `hidden` or `display:none`: a hidden
                // input is removed from the accessibility tree and cannot be
                // focused, which would silently delete the keyboard support
                // this component exists to keep.
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={[
                  'tappable flex min-h-touch min-w-[36px] cursor-pointer items-center justify-center',
                  // The focus ring lands on the LABEL, driven by the input
                  // beside it, because the input itself is invisible.
                  'peer-focus-visible:outline peer-focus-visible:outline-2',
                  'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                ].join(' ')}
              >
                <span className="sr-only">
                  {label}: <span className="tnum">{num(score)}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    'block h-[3px] w-full transition-colors duration-base ease-out',
                    filled ? 'bg-accent' : 'bg-line',
                  ].join(' ')}
                />
              </label>
            </span>
          );
        })}

        <span
          dir="ltr"
          className="tnum ms-3 min-w-[2ch] text-small text-ink2"
          aria-hidden="true"
        >
          {value === null ? '—' : num(value)}
        </span>
      </div>
    </fieldset>
  );
}
