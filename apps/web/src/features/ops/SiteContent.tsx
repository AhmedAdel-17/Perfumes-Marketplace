'use client';

/**
 * Announcements and the homepage, in one screen.
 *
 * They belong together because they are the two things that change what EVERY
 * visitor sees without anybody editing a page — which is also why both are
 * attributable and why the announcement expires on its own.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ANNOUNCEMENT_MAX_LENGTH } from '@diyar/domain';
import { data as num } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import { endAnnouncement, postAnnouncement, setCuration } from './site-actions';

export interface AnnouncementRow {
  id: string;
  message: string;
  messageEn: string | null;
  href: string | null;
  startsAt: string;
  endsAt: string;
  isShowing: boolean;
  isLive: boolean;
  hasEnded: boolean;
}

export interface CurationProduct {
  id: string;
  name: string;
  brandName: string;
}

const field = [
  'h-control w-full border border-line bg-sunken px-3 text-body text-ink',
  'transition-colors duration-base ease-out',
  'focus:border-ink focus:outline-none',
].join(' ');

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function when(iso: string): string {
  const at = new Date(iso);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${num(at.getDate())} ${MONTHS[at.getMonth()]} · ${time}`;
}

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time and has no timezone.
 *
 * Converting through `toISOString()` would silently shift an operator in Cairo
 * by two or three hours depending on the season — a notice scheduled for nine
 * in the morning appearing at six. The offset is removed explicitly so what is
 * typed is what is meant.
 */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SiteContent({ announcements, products, curation }: {
  announcements: AnnouncementRow[];
  products: CurationProduct[];
  curation: { heroProductId: string | null; featuredProductIds: string[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const now = new Date();
  const [message, setMessage] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [href, setHref] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalInput(now));
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(now.getTime() + 3 * 86_400_000)));
  const [objections, setObjections] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [hero, setHero] = useState(curation.heroProductId ?? '');
  const [featured, setFeatured] = useState<string[]>(curation.featuredProductIds);
  const [curationSaved, setCurationSaved] = useState(false);

  const post = () => startTransition(async () => {
    const result = await postAnnouncement({
      message,
      messageEn: messageEn.trim() === '' ? null : messageEn.trim(),
      href: href.trim() === '' ? null : href.trim(),
      // Back through the same local-time correction, so the instant sent is the
      // instant that was typed.
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });
    setObjections(result.objections ?? []);
    setError(result.message ?? null);
    if (result.ok) { setMessage(''); setMessageEn(''); setHref(''); router.refresh(); }
  });

  const end = (id: string) => startTransition(async () => {
    const result = await endAnnouncement(id);
    setError(result.ok ? null : result.message ?? 'تعذّر الإيقاف.');
    if (result.ok) router.refresh();
  });

  const saveCuration = () => startTransition(async () => {
    const result = await setCuration(hero === '' ? null : hero, featured);
    setError(result.ok ? null : result.message ?? 'تعذّر الحفظ.');
    setCurationSaved(result.ok);
    if (result.ok) router.refresh();
  });

  const toggleFeatured = (id: string) => {
    setCurationSaved(false);
    setFeatured((current) => (current.includes(id)
      ? current.filter((x) => x !== id)
      // Appended, so the order is the order they were chosen in — which is the
      // order the homepage shows them in.
      : [...current, id]));
  };

  return (
    <div className="px-5 lg:px-0">
      {/* ------------------------------------------------- announcements */}
      <section>
        <h2 className="mb-1 font-display text-h3">الإعلانات</h2>
        <p className="mb-6 text-small leading-relaxed text-ink3">
          سطر واحد أعلى كل صفحة، لمدة محدّدة. ينتهي وحده — لا حاجة لإزالته.
        </p>

        {announcements.length > 0 && (
          <ul className="mb-8 border-t border-line">
            {announcements.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-4">
                <div className="min-w-0">
                  <div className="text-body text-ink">{a.message}</div>
                  {a.messageEn && (
                    <div dir="ltr" lang="en" className="text-small text-ink2">{a.messageEn}</div>
                  )}
                  <div className="mt-1 text-small text-ink3">
                    <span className="tnum">{when(a.startsAt)}</span>
                    {' ← '}
                    <span className="tnum">{when(a.endsAt)}</span>
                    {a.href && <span className="latin ms-3">{a.href}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/*
                    THREE states, not two. "معروض" is what visitors see;
                    "مغطّى" is in window but hidden behind a newer notice —
                    without that distinction an operator posts something, sees
                    it listed as live, and never learns why nobody mentioned it.
                  */}
                  {a.isShowing && (
                    <span className={statusPill('accent')}>
                      معروض الآن
                    </span>
                  )}
                  {a.isLive && !a.isShowing && (
                    <span className={statusPill('quiet')}>
                      مغطّى بأحدث منه
                    </span>
                  )}
                  {!a.isLive && !a.hasEnded && (
                    <span className="text-small text-ink3">مجدول</span>
                  )}
                  {a.hasEnded && <span className="text-small text-ink3">انتهى</span>}

                  {a.isLive && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => end(a.id)}
                      className="tappable flex min-h-touch items-center text-small text-ink2 transition-colors duration-base ease-out hover:text-danger disabled:opacity-disabled"
                    >
                      إيقاف الآن
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-3">
          <label htmlFor="ann-message" className="mb-1.5 block text-small text-ink3">
            النص{' '}
            {/*
              ISOLATED, or the browser reorders it.

              "0/160" is three neutral runs inside a right-to-left paragraph, so
              the bidi algorithm reverses them and it renders as "160/0" — the
              counter appeared to start full and count DOWN as you typed. The
              fraction is a single Latin-direction unit and has to say so.
            */}
            <span dir="ltr" className="tnum latin">
              {num(message.length)}/{num(ANNOUNCEMENT_MAX_LENGTH)}
            </span>
          </label>
          <input
            id="ann-message" value={message} maxLength={ANNOUNCEMENT_MAX_LENGTH}
            onChange={(e) => setMessage(e.target.value)} className={field}
          />
        </div>

        {/*
          The same notice for the English site — optional. Left empty, English
          visitors read the Arabic line, marked as Arabic.
        */}
        <div className="mb-3">
          <label htmlFor="ann-message-en" className="mb-1.5 block text-small text-ink3">
            النص بالإنجليزية — اختياري{' '}
            <span dir="ltr" className="tnum latin">
              {num(messageEn.length)}/{num(ANNOUNCEMENT_MAX_LENGTH)}
            </span>
          </label>
          <input
            id="ann-message-en" value={messageEn} maxLength={ANNOUNCEMENT_MAX_LENGTH}
            dir="ltr" lang="en"
            onChange={(e) => setMessageEn(e.target.value)} className={field}
          />
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ann-start" className="mb-1.5 block text-small text-ink3">
              يبدأ
            </label>
            <input
              id="ann-start" type="datetime-local" value={startsAt} dir="ltr"
              onChange={(e) => setStartsAt(e.target.value)} className={`${field} latin text-start`}
            />
          </div>
          <div>
            <label htmlFor="ann-end" className="mb-1.5 block text-small text-ink3">
              ينتهي
            </label>
            <input
              id="ann-end" type="datetime-local" value={endsAt} dir="ltr"
              onChange={(e) => setEndsAt(e.target.value)} className={`${field} latin text-start`}
            />
          </div>
        </div>

        {/*
          What the browser understood, in the site's own words.

          `datetime-local` renders in the BROWSER's format, which on most
          machines here is 09/08/2026 — and an Egyptian operator has no way to
          know whether that is the eighth of September or the ninth of August.
          The control cannot be restyled, so the page states what it read, the
          same way the checkout shows a phone number back after converting its
          numerals.
        */}
        <p className="mb-4 text-small text-ink3">
          من <span className="tnum">{when(new Date(startsAt).toISOString())}</span>
          {' '}إلى <span className="tnum">{when(new Date(endsAt).toISOString())}</span>
        </p>

        <div className="mb-4">
          <label htmlFor="ann-href" className="mb-1.5 block text-small text-ink3">
            رابط داخلي — اختياري، يبدأ بـ /
          </label>
          <input
            id="ann-href" value={href} dir="ltr"
            onChange={(e) => setHref(e.target.value)} className={`${field} latin text-start`}
          />
        </div>

        {objections.length > 0 && (
          <ul className="mb-4 border-s-2 border-danger ps-4" aria-live="polite">
            {objections.map((text) => (
              <li key={text} className="py-1 text-small text-danger">{text}</li>
            ))}
          </ul>
        )}

        <PrimaryButton
          type="button" fill="auto" onClick={post}
          disabled={pending || message.trim().length === 0}
        >
          {pending ? '…' : 'نشر الإعلان'}
        </PrimaryButton>
      </section>

      {/* ------------------------------------------------------ curation */}
      <section className="mt-14 border-t border-line pt-9">
        <h2 className="mb-1 font-display text-h3">الصفحة الرئيسية</h2>
        <p className="mb-6 text-small leading-relaxed text-ink3">
          العطر الذي يفتح الموقع، والعطور التي تتصدّر الشبكة. النص والتصميم ثابتان.
        </p>

        <div className="mb-5">
          <label htmlFor="hero" className="mb-1.5 block text-small text-ink3">
            عطر الافتتاح
          </label>
          <select
            id="hero" value={hero} className={field}
            onChange={(e) => { setHero(e.target.value); setCurationSaved(false); }}
          >
            {/* The default is stated rather than implied: an empty select that
                silently means "the first one" is a setting nobody can read. */}
            <option value="">الأول في الكتالوج</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.brandName}</option>
            ))}
          </select>
        </div>

        <fieldset className="mb-5">
          <legend className="mb-2 text-small text-ink3">
            المتصدّرة — بالترتيب الذي تختاره
          </legend>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => {
              const at = featured.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={at !== -1}
                  onClick={() => toggleFeatured(p.id)}
                  className={[
                    'tappable flex min-h-touch items-center gap-2 border px-4 text-small',
                    'transition-colors duration-base ease-out',
                    at !== -1
                      ? 'border-accent text-accent'
                      : 'border-line text-ink hover:border-ink2',
                  ].join(' ')}
                >
                  {at !== -1 && <span className="tnum text-small">{num(at + 1)}</span>}
                  {p.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <PrimaryButton type="button" fill="auto" onClick={saveCuration} disabled={pending}>
          {pending ? '…' : curationSaved ? 'تم الحفظ' : 'حفظ'}
        </PrimaryButton>
      </section>

      {error && <p role="alert" className="mt-6 text-small text-danger">{error}</p>}
    </div>
  );
}
