/**
 * The audit trail, read by a person.
 *
 * A SERVER component with no client JavaScript at all. The filter and the
 * pages are links, so every view of the trail is a URL — which is what an
 * audit screen should be: "look at this" is a link pasted into a message, and
 * a view that lives in component state cannot be pasted anywhere.
 *
 * WHAT EACH ENTRY ANSWERS, in the order somebody asks it: what was decided,
 * about what, by whom, when — then what actually moved. The JSON the table
 * stores is never shown; `describeAuditChange` turns it into lines, and shows
 * anything it has no word for as written rather than dropping it.
 *
 * Nothing on this screen changes anything, and nothing ever should.
 */
import type { AuditAction } from '@diyar/domain';
import { AUDIT_ACTIONS } from '@diyar/domain';
import {
  AUDIT_ACTION_AR, AUDIT_ENTITY_AR, describeAuditChange, internalDate,
} from '@diyar/i18n';

export interface AuditEntryRow {
  id: string;
  action: string;
  actorLabel: string;
  entityTable: string;
  before: string | null;
  after: string | null;
  note: string | null;
  occurredAt: string;
}

const hrefFor = (params: { action?: AuditAction | undefined; before?: string | undefined }) => {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.before) query.set('before', params.before);
  const text = query.toString();
  return text ? `/ops/audit?${text}` : '/ops/audit';
};

const chip = (active: boolean) => [
  // Both axes: `الكل` is 33px wide at caption size, and a target has two
  // dimensions. Centred so the underline sits under the word, not beside it.
  'tappable inline-flex min-h-touch min-w-touch items-center justify-center border-b pb-0.5 text-small',
  'transition-colors duration-base ease-out hover:text-accent',
  active ? 'border-accent text-ink' : 'border-transparent text-ink3',
].join(' ');

/*
 * An audit entry's time is DATA — compared, quoted into an email, matched
 * against a bank statement — so it takes the operating tools' numerals.
 */
const when = (iso: string) => internalDate(iso, { time: true });

export function AuditLog({ entries, nextBefore, action, paged }: {
  entries: AuditEntryRow[];
  nextBefore: string | null;
  action: AuditAction | undefined;
  /** True when this is not the first page, so "newest" is worth offering. */
  paged: boolean;
}) {
  return (
    <div className="px-5 lg:px-0">
      <nav aria-label="نوع القرار" className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-3">
        <a href={hrefFor({})} aria-current={action === undefined ? 'page' : undefined} className={chip(action === undefined)}>
          الكل
        </a>
        {AUDIT_ACTIONS.map((option) => (
          <a
            key={option}
            href={hrefFor({ action: option })}
            aria-current={action === option ? 'page' : undefined}
            className={chip(action === option)}
          >
            {AUDIT_ACTION_AR[option]}
          </a>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="py-10 text-bodyLg text-ink2">
          {paged
            ? 'لا توجد قرارات أقدم.'
            : action
              ? 'لم يُسجَّل قرار من هذا النوع بعد.'
              : 'لم يُسجَّل أي قرار بعد.'}
        </p>
      ) : (
        <ol>
          {entries.map((entry) => <Entry key={entry.id} entry={entry} />)}
        </ol>
      )}

      {(nextBefore || paged) && (
        <nav aria-label="صفحات السجل" className="flex flex-wrap gap-x-6 border-t border-line pt-4">
          {paged && (
            <a href={hrefFor({ action })} className={chip(false)}>الأحدث</a>
          )}
          {nextBefore && (
            <a href={hrefFor({ action, before: nextBefore })} className={chip(false)}>أقدم</a>
          )}
        </nav>
      )}
    </div>
  );
}

function Entry({ entry }: { entry: AuditEntryRow }) {
  const lines = describeAuditChange(entry);
  const subject = (AUDIT_ENTITY_AR as Readonly<Record<string, string>>)[entry.entityTable]
    ?? entry.entityTable;

  return (
    <li className="border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-small text-ink">
          {(AUDIT_ACTION_AR as Readonly<Record<string, string>>)[entry.action] ?? entry.action}
          <span className="text-small text-ink3"> · {subject}</span>
        </h2>
        <time dateTime={entry.occurredAt} className="tnum text-small text-ink3">
          {when(entry.occurredAt)}
        </time>
      </div>

      <p className="mt-1 text-small text-ink2">بقرار من {entry.actorLabel}</p>

      {lines.length > 0 && (
        <dl className="mt-3 grid max-w-proseMax grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          {lines.map((line) => (
            <div key={line.field} className="contents">
              <dt className="text-small text-ink3">{line.label}</dt>
              <dd className="text-small text-ink">
                {line.from !== null && (
                  <>
                    <span className="text-ink3">من </span>
                    <span className="text-ink2">{line.from}</span>
                    <span className="text-ink3"> إلى </span>
                  </>
                )}
                {line.to ?? <span className="text-ink3">لم يُسجَّل</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {entry.note && (
        <p className="mt-3 max-w-proseMax border-s-2 border-line ps-3 text-small leading-relaxed text-ink2">
          {entry.note}
        </p>
      )}
    </li>
  );
}
