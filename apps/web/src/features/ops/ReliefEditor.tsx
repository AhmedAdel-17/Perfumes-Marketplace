'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { workingSize, type Point, type ReliefInput, type ReliefObjection, type ReliefPlacement } from '@diyar/domain';
import { RELIEF_OBJECTION_AR } from '@diyar/i18n';
import { confirmRelief, removeRelief, startReliefUpload } from './relief-actions';

/** A product as the console's relief screen gets it (`reliefs.list`). */
export interface ReliefRow {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly mediaId: string;
  readonly photoUrl: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
  readonly relief: {
    readonly cutoutUrl: string;
    readonly reliefUrl: string;
    readonly method: string;
    readonly opaque: boolean;
    readonly madeAt: string;
  } | null;
}

type Made = {
  readonly width: number;
  readonly height: number;
  readonly cutout: Uint8ClampedArray;
  readonly relief: Uint8ClampedArray;
  readonly placement: ReliefPlacement;
};

type WorkerReply =
  | { ok: true; width: number; height: number; cutout: ArrayBuffer; relief: ArrayBuffer; placement: ReliefPlacement }
  | { ok: false; objections?: ReliefObjection[]; failed?: string };

const asDataUrl = (width: number, height: number, data: Uint8ClampedArray): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL('image/png');
};

const asPng = (width: number, height: number, data: Uint8ClampedArray): Promise<Blob> => new Promise((resolve, reject) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
});

/**
 * The console's relief tool — where the content team lifts a perfume's bottle
 * out of its photograph for the reveal on its page (founder, 19 Oct 2026).
 *
 * Two ways, the founder's choice: AUTOMATIC for a photograph on a plain
 * background, and TRACED for anything else — the operator clicks around the
 * body, then the cap if it has one. Either way the arithmetic is the domain's
 * `makeRelief`, run here in a worker on the photograph's own pixels; the
 * operator sees the cut-out and its relief map before anything is saved, and
 * nothing reaches the shop until they press save.
 *
 * Pattern — a container component over the domain pipeline: state and I/O
 * here, every rule in `makeRelief` and in the router that verifies the result.
 */
export function ReliefEditor({ row }: { row: ReliefRow }) {
  const work = useMemo(() => workingSize(row.photoWidth, row.photoHeight), [row.photoWidth, row.photoHeight]);
  const [method, setMethod] = useState<'automatic' | 'traced'>('automatic');
  const [part, setPart] = useState<'body' | 'cap'>('body');
  const [body, setBody] = useState<Point[]>([]);
  const [cap, setCap] = useState<Point[]>([]);
  const [opaque, setOpaque] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'making' | 'saving' | 'removing'>('idle');
  const [made, setMade] = useState<Made | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pixels = useRef<ImageData | null>(null);
  const overlay = useRef<SVGSVGElement>(null);

  // The photograph's own pixels, at the working size, read once.
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = work.width; canvas.height = work.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, work.width, work.height);
      pixels.current = ctx.getImageData(0, 0, work.width, work.height);
    };
    image.onerror = () => setMessage({ tone: 'error', text: 'تعذّر تحميل الصورة. حدّث الصفحة.' });
    image.src = row.photoUrl;
  }, [row.photoUrl, work.width, work.height]);

  const preview = useMemo(() => (made
    ? { cutout: asDataUrl(made.width, made.height, made.cutout), relief: asDataUrl(made.width, made.height, made.relief) }
    : null), [made]);

  const addPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    if (method !== 'traced' || !overlay.current) return;
    const r = overlay.current.getBoundingClientRect();
    const point: Point = [((e.clientX - r.left) / r.width) * work.width, ((e.clientY - r.top) / r.height) * work.height];
    (part === 'body' ? setBody : setCap)((points) => [...points, point]);
    setMade(null);
  };

  const undo = () => { (part === 'body' ? setBody : setCap)((points) => points.slice(0, -1)); setMade(null); };
  const clear = () => { setBody([]); setCap([]); setPart('body'); setMade(null); };

  const make = async () => {
    const photo = pixels.current;
    if (!photo) { setMessage({ tone: 'error', text: 'الصورة لم تُحمَّل بعد.' }); return; }
    const input: ReliefInput = {
      outline: method === 'automatic' ? { method } : { method, body, ...(cap.length >= 3 ? { cap } : {}) },
      opaque,
    };
    setBusy('making'); setMessage(null); setMade(null);
    const data = new Uint8ClampedArray(photo.data).buffer;
    let reply: WorkerReply;
    try {
      reply = await new Promise<WorkerReply>((resolve, reject) => {
        const worker = new Worker(new URL('./relief.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerReply>) => { resolve(event.data); worker.terminate(); };
        worker.onerror = (event) => { reject(new Error(event.message)); worker.terminate(); };
        worker.postMessage({ width: photo.width, height: photo.height, data, input }, [data]);
      });
    } catch {
      setBusy('idle');
      setMessage({ tone: 'error', text: 'تعذّر تشغيل القصّ في هذا المتصفح.' });
      return;
    }
    setBusy('idle');
    if (!reply.ok) {
      const objection = reply.objections?.[0];
      setMessage({ tone: 'error', text: objection ? RELIEF_OBJECTION_AR[objection] : 'تعذّر صنع العرض المجسّم.' });
      return;
    }
    setMade({
      width: reply.width, height: reply.height,
      cutout: new Uint8ClampedArray(reply.cutout), relief: new Uint8ClampedArray(reply.relief),
      placement: reply.placement,
    });
  };

  const save = async () => {
    if (!made) return;
    setBusy('saving'); setMessage(null);
    try {
      const [cutoutPng, reliefPng] = await Promise.all([asPng(made.width, made.height, made.cutout), asPng(made.width, made.height, made.relief)]);
      const signed = await startReliefUpload(row.productId, row.mediaId);
      if (!signed.ok) throw new Error(signed.message);
      const put = async (target: { url: string; headers: Readonly<Record<string, string>> }, blob: Blob) => {
        const response = await fetch(target.url, { method: 'PUT', headers: target.headers, body: blob });
        if (!response.ok) throw new Error('تعذّر رفع الملف. حاول مرة أخرى.');
      };
      await Promise.all([put(signed.cutout, cutoutPng), put(signed.relief, reliefPng)]);
      const done = await confirmRelief({
        productId: row.productId, mediaId: row.mediaId, slug: row.slug,
        cutoutKey: signed.cutout.key, reliefKey: signed.relief.key,
        placement: made.placement, method, opaque,
      });
      if (!done.ok) throw new Error(done.message);
      setMessage({ tone: 'ok', text: 'حُفظ. يظهر الآن في صفحة العطر.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'تعذّر الحفظ.' });
    } finally {
      setBusy('idle');
    }
  };

  const remove = async () => {
    setBusy('removing'); setMessage(null);
    const done = await removeRelief(row.productId, row.mediaId, row.slug);
    setBusy('idle'); setConfirmRemove(false);
    setMessage(done.ok ? { tone: 'ok', text: 'حُذف العرض المجسّم. تظهر الصورة وحدها في صفحة العطر.' } : { tone: 'error', text: done.message ?? 'تعذّر الحذف.' });
  };

  const polygon = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const choice = (active: boolean) => [
    'flex min-h-touch min-w-touch items-center justify-center border-b-2 px-1 text-body transition-colors duration-base ease-out',
    active ? 'border-ink text-ink' : 'border-transparent text-ink2 hover:text-accent',
  ].join(' ');
  const action = 'flex min-h-touch items-center justify-center border border-line px-5 text-body transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-[.38]';

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ------------------------------------------------------------ the photograph */}
      <section aria-labelledby="relief-photo" className="grid content-start gap-4">
        <h2 id="relief-photo" className="font-display text-h4">الصورة الرئيسية</h2>
        <div role="radiogroup" aria-label="طريقة القصّ" className="flex gap-6">
          <button type="button" role="radio" aria-checked={method === 'automatic'} className={choice(method === 'automatic')}
            onClick={() => { setMethod('automatic'); setMade(null); }}>تلقائي — خلفية سادة</button>
          <button type="button" role="radio" aria-checked={method === 'traced'} className={choice(method === 'traced')}
            onClick={() => { setMethod('traced'); setMade(null); }}>رسم الحدود يدويًا</button>
        </div>
        {method === 'traced' && (
          <div className="grid gap-3 border border-line bg-raised p-4 text-small text-ink2">
            <p>اضغط حول <strong className="text-ink">جسم الزجاجة</strong> نقطةً بعد نقطة، ثم انتقل إلى <strong className="text-ink">الغطاء</strong> إن كان لها غطاء. الغطاء يحدّد اتجاه الوقوف.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={choice(part === 'body')} aria-pressed={part === 'body'} onClick={() => setPart('body')}>الجسم ({body.length})</button>
              <button type="button" className={choice(part === 'cap')} aria-pressed={part === 'cap'} onClick={() => setPart('cap')}>الغطاء ({cap.length})</button>
              <button type="button" className={choice(false)} onClick={undo}>تراجع عن نقطة</button>
              <button type="button" className={choice(false)} onClick={clear}>امسح</button>
            </div>
          </div>
        )}
        <div className="relative border border-line bg-plate">
          {/* eslint-disable-next-line @next/next/no-img-element -- the operator traces over the photograph's real pixels, at its real proportions */}
          <img src={row.photoUrl} alt={`الصورة الرئيسية لعطر ${row.name}`} className="block h-auto w-full" />
          <svg
            ref={overlay}
            viewBox={`0 0 ${work.width} ${work.height}`}
            className={`absolute inset-0 h-full w-full ${method === 'traced' ? 'cursor-crosshair' : 'pointer-events-none'}`}
            onClick={addPoint}
            aria-hidden="true"
          >
            {body.length > 0 && <polygon points={polygon(body)} fill="rgb(var(--c-accent) / 0.16)" stroke="rgb(var(--c-accent))" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {cap.length > 0 && <polygon points={polygon(cap)} fill="rgb(var(--c-ink) / 0.12)" stroke="rgb(var(--c-ink))" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
            {[...body, ...cap].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={Math.max(work.width, work.height) / 220} fill="rgb(var(--c-ground))" stroke="rgb(var(--c-ink))" vectorEffect="non-scaling-stroke" />)}
          </svg>
        </div>
        <label className="flex min-h-touch items-center gap-3 text-body">
          <input type="checkbox" checked={opaque} onChange={(e) => { setOpaque(e.target.checked); setMade(null); }} className="h-5 w-5 accent-[rgb(var(--c-accent))]" />
          زجاج معتم أو مصنفر — لا يظهر ما خلفه
        </label>
        <button type="button" className={action} disabled={busy !== 'idle' || (method === 'traced' && body.length < 3)} onClick={make}>
          {busy === 'making' ? 'جارٍ القصّ…' : 'اصنع العرض المجسّم'}
        </button>
      </section>

      {/* ------------------------------------------------------------ the result */}
      <section aria-labelledby="relief-result" className="grid content-start gap-4" aria-live="polite">
        <h2 id="relief-result" className="font-display text-h4">النتيجة</h2>
        {preview ? (
          <div data-theme="dark" className="grid grid-cols-2 gap-px border border-line bg-line">
            <figure className="grid place-items-center bg-ground p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a preview made in this browser, never served */}
              <img src={preview.cutout} alt="الزجاجة مقصوصة" className="max-h-[360px] w-auto" />
              <figcaption className="mt-3 text-small text-ink3">القصّ</figcaption>
            </figure>
            <figure className="grid place-items-center bg-ground p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a preview made in this browser, never served */}
              <img src={preview.relief} alt="خريطة البروز" className="max-h-[360px] w-auto" />
              <figcaption className="mt-3 text-small text-ink3">البروز</figcaption>
            </figure>
          </div>
        ) : row.relief ? (
          <div data-theme="dark" className="grid gap-3 border border-line bg-ground p-5 text-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- the saved cut-out, as the shop serves it */}
            <img src={row.relief.cutoutUrl} alt="العرض المجسّم المحفوظ" className="mx-auto max-h-[360px] w-auto" />
            <p className="text-small text-ink2">
              محفوظ — {row.relief.method === 'automatic' ? 'قصّ تلقائي' : 'برسم الحدود يدويًا'}
              {row.relief.opaque ? '، زجاج معتم' : ''}
              <span className="latin ms-2 text-caption text-ink3">{row.relief.madeAt.slice(0, 10)}</span>
            </p>
          </div>
        ) : (
          <p className="border border-dashed border-line p-6 text-body text-ink2">لا يوجد عرض مجسّم لهذا العطر بعد. اختر الطريقة واضغط «اصنع العرض المجسّم».</p>
        )}

        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-body ${message.tone === 'error' ? 'text-danger' : 'text-ink'}`}>{message.text}</p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" className={action} disabled={!made || busy !== 'idle'} onClick={save}>
            {busy === 'saving' ? 'جارٍ الحفظ…' : 'احفظ وانشر في صفحة العطر'}
          </button>
          <a href={`/p/${row.slug}`} target="_blank" rel="noreferrer" className={action}>افتح صفحة العطر</a>
          {row.relief && !confirmRemove && (
            <button type="button" className={action} disabled={busy !== 'idle'} onClick={() => setConfirmRemove(true)}>احذف العرض المجسّم</button>
          )}
          {row.relief && confirmRemove && (
            <button type="button" className={`${action} border-danger text-danger`} disabled={busy !== 'idle'} onClick={remove}>
              {busy === 'removing' ? 'جارٍ الحذف…' : 'تأكيد الحذف'}
            </button>
          )}
        </div>
        <p className="text-small text-ink3">يُصنع العرض من صورة الدار نفسها، دون إضافة أي شيء إلى العبوة. كل حفظ وحذف يُسجَّل في سجل القرارات.</p>
      </section>
    </div>
  );
}
