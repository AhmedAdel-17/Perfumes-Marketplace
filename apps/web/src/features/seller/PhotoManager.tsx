'use client';

/**
 * A house's photographs for one listing — WORK_PLAN 5.7.4.
 *
 * WHAT THIS SCREEN IS FOR. The listing cannot publish without a primary
 * photograph, and until this existed a house had no way to add one. So the
 * screen is built around that one outcome, and everything on it is in the
 * order a house does it: describe the photograph, confirm it is yours, choose
 * the file, watch it arrive.
 *
 * FOUR DECISIONS WORTH KNOWING.
 *
 * 1. The description and the ownership confirmation come BEFORE the file. A
 *    house that uploads 6 MB and is then told to describe it has done the work
 *    in the wrong order; asking first means an upload is never wasted on a
 *    refusal the house could have avoided.
 *
 * 2. The browser checks type, size and dimensions before anything is sent —
 *    as a courtesy, not a control. The server reads the file's own bytes after
 *    it arrives and decides for itself; nothing here is trusted.
 *
 * 3. Reordering is two buttons, not drag and drop. Drag has no keyboard path,
 *    works badly on a phone held in one hand, and cannot be announced to a
 *    screen reader in any way a person would want to hear.
 *
 * 4. Removal asks twice. A photograph is the most expensive thing on a listing
 *    to replace — somebody set up the bottle, the light and the marble — and a
 *    single tap that deletes it is a single tap somebody regrets.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IMAGE_TYPES, MEDIA_LIMITS, MAX_PHOTOS, ALT_TEXT_MAX, type ImageType } from '@diyar/domain';
import { internal as num } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { INTERRUPTED_UPLOAD, reasonNotToSend, sendFile } from '@/features/media/upload';
import {
  confirmPhoto, describePhoto, makePrimaryPhoto, removePhoto, reorderPhotos, startPhotoUpload,
} from './photo-actions';

export interface PhotoView {
  id: string;
  alt: string;
  position: number;
  isPrimary: boolean;
  ownershipConfirmed: boolean;
  width: number | null;
  height: number | null;
  /** Null for a row that did not come through the verified upload flow. */
  url: string | null;
}

const control = 'w-full rounded-sm border border-line bg-ground px-3 text-body text-ink transition-colors duration-base ease-out focus:border-ink2 focus:outline-none focus-visible:border-accent';

const quiet = 'tappable inline-flex min-h-touch min-w-touch items-center justify-center text-caption tracking-label text-ink2 transition-colors duration-base ease-out hover:text-accent disabled:opacity-disabled';

export function PhotoManager({ productId, photos, readOnly }: {
  productId: string;
  photos: PhotoView[];
  /** An archived listing's photographs are shown, not edited. */
  readOnly: boolean;
}) {
  const hasRoom = photos.length < MAX_PHOTOS;

  return (
    <section aria-labelledby="photos-heading" className="mb-9 px-5 lg:px-0">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
        <h2 id="photos-heading" className="font-display text-h3 lg:text-h2Lg">الصور</h2>
        <p className="text-caption text-ink3">
          <span className="tnum">{num(photos.length)}</span> من <span className="tnum">{num(MAX_PHOTOS)}</span>
          {' · '}الأولى في الترتيب ليست بالضرورة الرئيسية
        </p>
      </div>

      {photos.length === 0 ? (
        <p className="mb-6 border-s-2 border-line ps-4 text-small leading-relaxed text-ink2">
          لا توجد صور بعد. المنتج لا يُنشر بدون صورة رئيسية — أول صورة تضيفها تصبح الرئيسية.
        </p>
      ) : (
        <ol className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              productId={productId}
              photo={photo}
              order={photos.map((p) => p.id)}
              index={index}
              readOnly={readOnly}
            />
          ))}
        </ol>
      )}

      {!readOnly && (hasRoom
        ? <AddPhoto productId={productId} />
        : (
          <p className="text-small text-ink2">
            وصل المنتج إلى الحد الأقصى من الصور. احذف صورة قبل إضافة أخرى.
          </p>
        ))}
    </section>
  );
}

function PhotoCard({ productId, photo, order, index, readOnly }: {
  productId: string;
  photo: PhotoView;
  order: string[];
  index: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState(photo.alt);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const run = (work: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) setError(result.message ?? 'تعذّر تنفيذ الإجراء.');
      else router.refresh();
    });
  };

  const move = (by: -1 | 1) => {
    const next = [...order];
    const target = index + by;
    [next[index], next[target]] = [next[target]!, next[index]!];
    run(() => reorderPhotos({ productId, photoIds: next }));
  };

  const altChanged = alt.trim() !== photo.alt;

  return (
    <li className="flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden border border-line bg-plate">
        {photo.url ? (
          // A plain <img> in the console: the photographs are served from
          // storage at their full size, the dimensions are known, and the
          // optimisation pipeline is a storefront decision (TECH_STACK, M-1).
          <img
            src={photo.url}
            alt={photo.alt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-caption leading-relaxed text-ink3">
            هذه الصورة لم تُرفع بالطريقة المعتمدة ولا يمكن عرضها. أضف صورة جديدة ثم احذف هذه.
          </div>
        )}
        {photo.isPrimary && (
          <span className="absolute start-2 top-2 rounded-pill border border-line bg-ground px-2.5 py-0.5 text-micro tracking-label text-ink">
            رئيسية
          </span>
        )}
      </div>

      {readOnly ? (
        <p className="mt-2 text-caption leading-relaxed text-ink2">{photo.alt}</p>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="mb-1 block text-micro tracking-label text-ink3">وصف الصورة</span>
            <input
              type="text"
              value={alt}
              maxLength={ALT_TEXT_MAX}
              onChange={(event) => setAlt(event.target.value)}
              className={`${control} h-control text-small`}
            />
          </label>
          {altChanged && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => describePhoto({
                productId, photoId: photo.id, alt, ownershipConfirmed: photo.ownershipConfirmed,
              }))}
              className={`${quiet} self-start`}
            >
              حفظ الوصف
            </button>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3">
            {!photo.isPrimary && photo.url && (
              <button type="button" disabled={pending} className={quiet}
                onClick={() => run(() => makePrimaryPhoto({ productId, photoId: photo.id }))}>
                اجعلها رئيسية
              </button>
            )}
            {index > 0 && (
              <button type="button" disabled={pending} className={quiet}
                aria-label={`تقديم الصورة ${num(index + 1)}`} onClick={() => move(-1)}>
                تقديم
              </button>
            )}
            {index < order.length - 1 && (
              <button type="button" disabled={pending} className={quiet}
                aria-label={`تأخير الصورة ${num(index + 1)}`} onClick={() => move(1)}>
                تأخير
              </button>
            )}
          </div>

          {confirmingRemoval ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3" role="group" aria-label="تأكيد حذف الصورة">
              <button type="button" disabled={pending}
                className={`${quiet} text-danger hover:text-danger`}
                onClick={() => run(() => removePhoto({ productId, photoId: photo.id }))}>
                تأكيد الحذف
              </button>
              <button type="button" disabled={pending} className={quiet}
                onClick={() => setConfirmingRemoval(false)}>
                تراجع
              </button>
            </div>
          ) : (
            <button type="button" disabled={pending} className={`${quiet} self-start`}
              onClick={() => setConfirmingRemoval(true)}>
              حذف
            </button>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-2 text-caption leading-relaxed text-danger">{error}</p>}
    </li>
  );
}

function AddPhoto({ productId }: { productId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [owned, setOwned] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = alt.trim().length > 0 && owned && file !== null && !pending;

  const choose = async (chosen: File | null) => {
    setError(null);
    setFile(null);
    if (!chosen) return;

    // Courtesy checks — the server decides. Saying so early saves a house an
    // upload over a phone connection that was always going to be refused.
    const reason = await reasonNotToSend(chosen);
    if (reason) {
      setError(reason);
      return;
    }
    setFile(chosen);
  };

  const submit = () => {
    if (!file) return;
    setError(null);
    start(async () => {
      const started = await startPhotoUpload({
        productId, contentType: file.type as ImageType, byteSize: file.size,
      });
      if (!started.ok) {
        setError(started.message);
        return;
      }

      try {
        setProgress(0);
        await sendFile(started.value.url, started.value.headers, file, setProgress);
      } catch {
        setProgress(null);
        setError(INTERRUPTED_UPLOAD);
        return;
      }

      const confirmed = await confirmPhoto({
        productId, key: started.value.key, alt, ownershipConfirmed: owned,
      });
      setProgress(null);
      if (!confirmed.ok) {
        setError(confirmed.message);
        return;
      }

      setAlt('');
      setOwned(false);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });
  };

  return (
    <div className="max-w-proseMax border border-line bg-raised p-5">
      <h3 className="mb-1 text-small text-ink">إضافة صورة</h3>
      <p className="mb-5 text-caption leading-relaxed text-ink3">
        JPG أو PNG أو WebP · حتى 10 ميجابايت · لا يقل الضلع الأقصر عن 800 بكسل
      </p>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-caption tracking-label text-ink2">
          وصف الصورة — ماذا يظهر فيها؟
        </span>
        <input
          type="text"
          value={alt}
          maxLength={ALT_TEXT_MAX}
          placeholder="مثال: الزجاجة على رخام أسود، من الأمام"
          onChange={(event) => setAlt(event.target.value)}
          className={`${control} h-control`}
        />
      </label>

      <label className="mb-5 flex min-h-touch cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={owned}
          onChange={(event) => setOwned(event.target.checked)}
          className="mt-1 h-4 w-4 flex-none accent-accent"
        />
        <span className="text-small leading-relaxed text-ink2">
          أؤكد أن الدار تملك هذه الصورة أو تملك حق استخدامها، وأنها لمنتج الدار نفسه.
        </span>
      </label>

      <label className="mb-5 block">
        <span className="mb-1.5 block text-caption tracking-label text-ink2">الملف</span>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={(event) => void choose(event.target.files?.[0] ?? null)}
          className="block min-h-touch w-full text-small text-ink2 file:me-3 file:min-h-touch file:cursor-pointer file:rounded-sm file:border file:border-line file:bg-ground file:px-4 file:text-small file:text-ink"
        />
      </label>

      {progress !== null && (
        <div className="mb-4" aria-live="polite">
          <div
            role="progressbar"
            aria-label="تقدّم رفع الصورة"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="relative h-[3px] w-full overflow-hidden rounded-pill bg-line"
          >
            {/* Fills from the right, like every meter on an Arabic page. */}
            <span
              className="absolute inset-y-0 start-0 rounded-pill bg-accent transition-[width] duration-base ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-micro text-ink3">
            {progress < 1 ? 'جارٍ الرفع…' : 'تم الرفع — جارٍ التحقّق من الصورة…'}
          </p>
        </div>
      )}

      {error && <p role="alert" className="mb-4 text-small leading-relaxed text-danger">{error}</p>}

      <PrimaryButton type="button" fill="auto" disabled={!ready} onClick={submit}>
        {pending ? '…' : 'رفع الصورة'}
      </PrimaryButton>
    </div>
  );
}
