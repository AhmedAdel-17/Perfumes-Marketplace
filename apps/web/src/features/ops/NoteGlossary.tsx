'use client';

import { useState, useTransition } from 'react';
import { internal as num } from '@diyar/i18n';
import { removeNoteEnglish, setNoteEnglish } from './glossary-actions';

export interface GlossaryRow {
  readonly ar: string;
  readonly en: string | null;
  readonly uses: number;
}

/**
 * The glossary as a list the content manager works down.
 *
 * Untranslated notes first, most used first — the order in which each English
 * name helps the most visitors. One row per note, edited in place: this is a
 * vocabulary, and a vocabulary is maintained a word at a time.
 */
export function NoteGlossary({ rows }: { rows: readonly GlossaryRow[] }) {
  const missing = rows.filter((row) => row.en === null && row.uses > 0).length;

  if (rows.length === 0) {
    return <p className="px-5 py-8 text-small text-ink3 lg:px-0">لا توجد نفحات في أي منتج بعد.</p>;
  }

  return (
    <div className="px-5 lg:px-0">
      <p className="mb-5 text-caption text-ink3">
        {missing === 0
          ? 'كل النفحات المستخدمة لها اسم إنجليزي.'
          : <>بلا اسم إنجليزي: <span className="tnum">{num(missing)}</span></>}
      </p>
      <ul className="border-t border-line">
        {rows.map((row) => <Row key={row.ar} row={row} />)}
      </ul>
    </div>
  );
}

function Row({ row }: { row: GlossaryRow }) {
  const [value, setValue] = useState(row.en ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const id = `note-${encodeURIComponent(row.ar)}`;
  const changed = value.trim() !== (row.en ?? '');

  const save = () => start(async () => {
    const result = await setNoteEnglish(row.ar, value.trim());
    setError(result.ok ? null : result.message ?? null);
    setSaved(result.ok);
  });

  const remove = () => start(async () => {
    const result = await removeNoteEnglish(row.ar);
    setError(result.ok ? null : result.message ?? null);
    if (result.ok) { setValue(''); setSaved(false); }
  });

  return (
    <li className="grid gap-3 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
      <div>
        <label htmlFor={id} className="text-body text-ink">{row.ar}</label>
        <div className="mt-0.5 text-caption text-ink3">
          {row.uses === 0 ? 'غير مستخدمة في أي منتج' : <>في <span className="tnum">{num(row.uses)}</span> منتج</>}
        </div>
      </div>
      <input
        id={id}
        value={value}
        maxLength={40}
        dir="ltr"
        lang="en"
        placeholder="English name"
        onChange={(event) => { setValue(event.target.value); setSaved(false); }}
        className="h-control w-full rounded-sm border border-line bg-ground px-3 text-body text-ink transition-colors duration-base ease-out placeholder:text-ink3 focus:border-ink2 focus:outline-none focus-visible:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !changed || value.trim() === ''}
          onClick={save}
          className="tappable flex min-h-touch items-center rounded-sm border border-line px-4 text-small text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
        >
          {saved && !changed ? 'تم الحفظ' : 'حفظ'}
        </button>
        {row.en !== null && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="tappable flex min-h-touch items-center px-2 text-caption text-ink3 transition-colors duration-base ease-out hover:text-danger disabled:opacity-disabled"
          >
            حذف
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-small text-danger sm:col-span-3">{error}</p>}
    </li>
  );
}
