'use client';

import { useState, useTransition } from 'react';
import { NOTE_ICONS, type NoteIcon } from '@diyar/domain';
import { internal as num, NOTE_ICON_AR } from '@diyar/i18n';
import { NoteIconMark } from '@/features/catalogue/NoteChip';
import { removeNoteEnglish, setNoteEnglish } from './glossary-actions';

export interface GlossaryRow {
  readonly ar: string;
  readonly en: string | null;
  readonly icon: NoteIcon | null;
  readonly uses: number;
}

/**
 * The glossary as a list the content manager works down.
 *
 * Untranslated notes first, most used first — the order in which each English
 * name helps the most visitors. One row per note, edited in place: this is a
 * vocabulary, and a vocabulary is maintained a word at a time.
 *
 * Each note also takes its DRAWING here (17 Oct 2026): the picture the
 * storefront prints beside it, chosen from the closed set of note icons. The
 * English name is required to save, because a glossary entry is an English
 * name first — the table holds no entry without one.
 */
export function NoteGlossary({ rows }: { rows: readonly GlossaryRow[] }) {
  const missing = rows.filter((row) => row.en === null && row.uses > 0).length;

  if (rows.length === 0) {
    return <p className="px-5 py-8 text-small text-ink3 lg:px-0">لا توجد نفحات في أي منتج بعد.</p>;
  }

  return (
    <div className="px-5 lg:px-0">
      <p className="mb-5 text-small text-ink3">
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
  const [icon, setIcon] = useState<NoteIcon | null>(row.icon);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const id = `note-${encodeURIComponent(row.ar)}`;
  const changed = value.trim() !== (row.en ?? '') || icon !== row.icon;

  const save = () => start(async () => {
    const result = await setNoteEnglish(row.ar, value.trim(), icon);
    setError(result.ok ? null : result.message ?? null);
    setSaved(result.ok);
  });

  const remove = () => start(async () => {
    const result = await removeNoteEnglish(row.ar);
    setError(result.ok ? null : result.message ?? null);
    if (result.ok) { setValue(''); setIcon(null); setSaved(false); }
  });

  return (
    <li className="grid gap-3 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
      <div>
        <label htmlFor={id} className="text-body text-ink">{row.ar}</label>
        <div className="mt-0.5 text-small text-ink3">
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
        className="h-control w-full border border-line bg-sunken px-3 text-body text-ink transition-colors duration-base ease-out placeholder:text-ink3 focus:border-ink focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !changed || value.trim() === ''}
          onClick={save}
          className="tappable flex min-h-touch items-center border border-line px-4 text-small text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
        >
          {saved && !changed ? 'تم الحفظ' : 'حفظ'}
        </button>
        {row.en !== null && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="tappable flex min-h-touch items-center px-2 text-small text-ink3 transition-colors duration-base ease-out hover:text-danger disabled:opacity-disabled"
          >
            حذف
          </button>
        )}
      </div>
      {/* The drawing: one choice from the closed set, or none (the diamond). */}
      <div role="radiogroup" aria-label={`رسم «${row.ar}»`} className="flex flex-wrap gap-1.5 sm:col-span-3">
        {[null, ...NOTE_ICONS].map((key) => {
          const chosen = icon === key;
          return (
            <button
              key={key ?? 'none'}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={key ? NOTE_ICON_AR[key] : 'بلا رسم'}
              title={key ? NOTE_ICON_AR[key] : 'بلا رسم'}
              onClick={() => { setIcon(key); setSaved(false); }}
              className={[
                'tappable grid h-9 w-9 place-items-center border transition-colors duration-base ease-out',
                chosen ? 'border-ink bg-ink text-ground' : 'border-line text-ink2 hover:border-accent hover:text-accent',
              ].join(' ')}
            >
              <NoteIconMark icon={key} className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>
      {icon !== row.icon && value.trim() === '' && (
        <p className="text-small text-ink3 sm:col-span-3">اكتب الاسم الإنجليزي ليُحفظ الرسم معه.</p>
      )}
      {error && <p role="alert" className="text-small text-danger sm:col-span-3">{error}</p>}
    </li>
  );
}
