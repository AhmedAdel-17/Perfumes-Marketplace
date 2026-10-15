'use client';

import { useSearchParams } from 'next/navigation';
import { SEARCH } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { field, FILTERS_FORM } from './Filters';

/**
 * The search field, in the page head rather than the filter column.
 *
 * In the column it was 150px wide at desktop, and its own placeholder was cut
 * to "Search for a perfu". It joins the filter form through the `form`
 * attribute, so pressing Enter or the button submits that one GET form, the
 * filters' submit handler reads the text from it (FormData includes associated
 * controls), and with JavaScript off the browser builds the same URL.
 */
export function SearchBox({ text }: { text: string }) {
  const params = useSearchParams();
  const copy = SEARCH[useLocale()];

  return (
    <div role="search" className="flex w-full gap-2 lg:w-[440px]">
      <input
        form={FILTERS_FORM}
        name="q"
        defaultValue={text}
        // The key resets the field when the URL changes underneath it — a
        // cleared search must clear the box, and an uncontrolled input keeps
        // whatever was typed otherwise.
        key={params.toString()}
        maxLength={120}
        type="search"
        aria-label={copy.fieldLabel}
        placeholder={copy.fieldLabel}
        className={`h-control w-full min-w-0 px-4 text-bodyLg ${field}`}
      />
      <button
        form={FILTERS_FORM}
        type="submit"
        className="tappable flex h-control min-w-touch flex-none items-center justify-center border border-ink bg-ink px-5 text-body text-ground transition-colors duration-base ease-out hover:bg-accent-surface hover:text-on-accent"
      >
        {copy.submit}
      </button>
    </div>
  );
}
