'use client';

/**
 * The block editor.
 *
 * WHAT AN EDITOR CAN DO HERE IS THE POINT. They choose what a block MEANS —
 * an opening, a passage, a quote, a labelled list — and they choose the words.
 * They cannot choose a size, a colour, a weight or an alignment, because the
 * design system decides those and it decides them the same way on every page.
 * A rich-text box would hand all four back and there would be no way to say
 * afterwards that a page was wrong.
 *
 * State lives here rather than on the server between keystrokes. Saving is
 * explicit: an autosave would write to `draft_blocks` continuously, and while
 * that would never reach a visitor — the site serves the published revision —
 * it would mean an editor who wandered off mid-sentence could not get back to
 * what they had before they started.
 */
import { useRef, useState, useTransition } from 'react';
import type { Block, BlockKind, ImageType, PageState, PublishObjection } from '@diyar/domain';
import { BLOCK_KINDS, LIMITS } from '@diyar/domain';
import { PAGE_STATE_AR } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { statusPill } from '@/features/shell/status-pill';
import type { ContentImageView, ContentImages } from '@/features/content/Blocks';
import { INTERRUPTED_UPLOAD, reasonNotToSend, sendFile } from '@/features/media/upload';
import { ProductPhoto } from '@/features/product/ProductPhoto';
import {
  confirmContentImage, movePageTo, savePageDraft, startContentImageUpload,
} from './content-actions';
import { UploadProgress } from '@/features/shell/FlaconLoader';

/** Arabic names for the block kinds, as a complete Record over the union. */
const KIND_LABELS: Record<BlockKind, string> = {
  heading: 'عنوان قسم',
  passage: 'فقرة',
  pull_quote: 'اقتباس',
  note_list: 'قائمة معرّفة',
  image: 'صورة',
  divider: 'فاصل',
  call_to_action: 'زر إجراء',
};

const STATE_LABELS: Record<PageState, string> = PAGE_STATE_AR;

/** What each move is CALLED from the operator's side, not the machine's. */
const MOVE_LABELS: Record<PageState, string> = {
  draft: 'إرجاع إلى المسودة',
  in_review: 'إرسال للمراجعة',
  published: 'نشر',
  archived: 'أرشفة',
};

/**
 * Objections, in words an editor can act on.
 *
 * A code like `heading_order` tells a developer what happened and an editor
 * nothing at all. Each of these says what is wrong AND what to do, because a
 * message that only diagnoses leaves the reader to guess the remedy.
 */
function objectionText(objection: PublishObjection): string {
  const text = objectionTextIn(objection);
  return objection.inEnglish ? `النسخة الإنجليزية: ${text}` : text;
}

function objectionTextIn(objection: PublishObjection): string {
  const where = objection.blockIndex === undefined
    ? '' : ` — العنصر رقم ${objection.blockIndex + 1}`;

  switch (objection.code) {
    case 'empty_document': return 'الصفحة فارغة. أضف عنصرًا واحدًا على الأقل.';
    case 'empty_block': return `عنصر بلا محتوى. اكتب فيه أو احذفه${where}`;
    case 'too_many_blocks': return `الصفحة أطول من الحد (${LIMITS.blocksPerPage} عنصرًا).`;
    case 'heading_order': return `القسم يبدأ بعنوان فرعي. اجعل أول عنوان رئيسيًا${where}`;
    case 'external_link': return `الروابط الخارجية غير مسموح بها. استخدم مسارًا داخلي${where}`;
    case 'missing_alt': return `الصورة بلا وصف بديل، ولن يقرأها قارئ الشاشة${where}`;
    case 'unverified_image': return `الصورة لم تُرفع عبر المنصّة. ارفعها من جديد${where}`;
    case 'over_length': return `النص أطول من الحد المسموح${where}`;
  }
}

/* ------------------------------------------------------------ field atoms */

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-small text-ink3">
      {children}
    </label>
  );
}

/*
 * `h-control` — 52px, the same height as every field on the shopfront.
 *
 * These were `py-2.5`, which rendered at 43px: one pixel under the 44pt floor,
 * at every width, on every control in the console. The audit found it the first
 * time these screens were included in it, which is the argument for including
 * them: an internal tool is exactly the surface that gets excused, and it is
 * the one people use for hours at a time.
 */
const inputClass = [
  'h-control w-full border border-line bg-sunken px-3 text-body text-ink',
  'transition-colors duration-base ease-out',
  'focus:border-ink focus:outline-none',
].join(' ');

/** A textarea sizes by rows, so it takes the same look without the fixed height. */
const areaClass = [
  'min-h-touch w-full border border-line bg-ground px-3 py-3 text-body text-ink',
  'transition-colors duration-base ease-out leading-relaxed',
  'focus:border-ink focus:outline-none',
].join(' ');

function Text({
  id, label, value, onChange, maxLength, ltr = false,
}: {
  id: string; label: string; value: string;
  onChange(v: string): void; maxLength?: number; ltr?: boolean;
}) {
  return (
    <div className="mb-3">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        // A path is Latin and reads wrongly under the page's RTL direction,
        // so the field carries its own.
        dir={ltr ? 'ltr' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass}${ltr ? ' latin text-start' : ''}`}
      />
    </div>
  );
}

function Area({
  id, label, value, onChange, maxLength, rows = 5,
}: {
  id: string; label: string; value: string;
  onChange(v: string): void; maxLength?: number; rows?: number;
}) {
  return (
    <div className="mb-3">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={areaClass}
      />
    </div>
  );
}

/**
 * An editorial image: choose a file, and see what arrived.
 *
 * This replaced a text field labelled "image key" that saved whatever was typed
 * into it. The key is now never typed and never shown — the operator sees the
 * picture, and the key is one the server issued for this page and verified.
 */
function ImageField({ id, pageId, mediaKey, image, alt, onUploaded }: {
  id: string;
  pageId: string;
  mediaKey: string;
  image: ContentImageView | undefined;
  alt: string;
  onUploaded(key: string, image: ContentImageView): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File | null) => {
    setError(null);
    if (!file) return;
    start(async () => {
      const reason = await reasonNotToSend(file);
      if (reason) {
        setError(reason);
        return;
      }

      const started = await startContentImageUpload(pageId, file.type as ImageType, file.size);
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

      const confirmed = await confirmContentImage(pageId, started.value.key);
      setProgress(null);
      if (!confirmed.ok) {
        setError(confirmed.message);
        return;
      }
      const { key, url, width, height } = confirmed.value;
      onUploaded(key, { url, width, height });
      if (input.current) input.current.value = '';
    });
  };

  return (
    <div className="mb-3">
      {image ? (
        <div className="relative mb-3 aspect-[3/2] w-full overflow-hidden border border-line bg-ground sm:w-1/2">
          <ProductPhoto
            photo={{ url: image.url, alt, width: image.width, height: image.height }}
            sizes="(min-width: 640px) 50vw, 100vw"
          />
        </div>
      ) : mediaKey.trim() ? (
        // A key saved before uploads existed, or typed by hand. Said plainly,
        // because the publish rule will refuse it and the editor should know why.
        <p className="mb-3 border-s-2 border-danger ps-4 text-small leading-relaxed text-ink2">
          هذه الصورة لم تُرفع عبر المنصّة، ولن تُنشر. ارفع الملف من جديد.
        </p>
      ) : null}

      <Label htmlFor={id}>{image ? 'استبدال الصورة' : 'الصورة'}</Label>
      <input
        id={id}
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={pending}
        onChange={(event) => upload(event.target.files?.[0] ?? null)}
        className="block min-h-touch w-full text-small text-ink2"
      />
      <p className="mt-1.5 text-small text-ink3">
        JPG أو PNG أو WebP · حتى 10 ميجابايت · لا يقل الضلع الأقصر عن 800 بكسل
      </p>
      {progress !== null && (
        <div className="mt-3">
          <UploadProgress
            progress={progress}
            label="تقدّم رفع الصورة"
            note={progress < 1 ? 'جارٍ الرفع…' : 'تم الرفع — جارٍ التحقّق من الصورة…'}
          />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------- per-kind editors */

function BlockFields({
  block, index, onChange, pageId, images, onImage,
}: {
  block: Block; index: number; onChange(next: Block): void;
  pageId: string;
  images: ContentImages;
  onImage(key: string, image: ContentImageView): void;
}) {
  const id = (field: string) => `b${index}-${field}`;

  switch (block.kind) {
    case 'heading':
      return (
        <>
          <div className="mb-3">
            <Label htmlFor={id('level')}>المستوى</Label>
            <select
              id={id('level')}
              value={block.level}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 2 | 3 })}
              className={inputClass}
            >
              {/* 2 and 3 only. The page title is the only h1 there is. */}
              <option value={2}>عنوان رئيسي</option>
              <option value={3}>عنوان فرعي</option>
            </select>
          </div>
          <Text
            id={id('text')} label="النص" value={block.text}
            maxLength={LIMITS.headingText}
            onChange={(text) => onChange({ ...block, text })}
          />
        </>
      );

    case 'passage':
      return (
        <Area
          id={id('text')} label="النص — افصل الفقرات بسطر فارغ" value={block.text}
          maxLength={LIMITS.passageText} rows={7}
          onChange={(text) => onChange({ ...block, text })}
        />
      );

    case 'pull_quote':
      return (
        <>
          <Area
            id={id('text')} label="الاقتباس" value={block.text}
            maxLength={LIMITS.quoteText} rows={3}
            onChange={(text) => onChange({ ...block, text })}
          />
          <Text
            id={id('attr')} label="المصدر — اختياري" value={block.attribution ?? ''}
            maxLength={LIMITS.attribution}
            onChange={(v) => onChange(
              v.trim() ? { ...block, attribution: v } : { kind: 'pull_quote', text: block.text },
            )}
          />
        </>
      );

    case 'note_list':
      return (
        <div>
          {block.items.map((item, i) => (
            <div key={i} className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={item.term}
                maxLength={LIMITS.noteTerm}
                aria-label={`المصطلح ${i + 1}`}
                onChange={(e) => onChange({
                  ...block,
                  items: block.items.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)),
                })}
                className={`${inputClass} sm:w-[180px] sm:shrink-0`}
              />
              <input
                value={item.detail ?? ''}
                maxLength={LIMITS.noteDetail}
                aria-label={`الشرح ${i + 1}`}
                onChange={(e) => onChange({
                  ...block,
                  items: block.items.map((x, j) => (j === i
                    ? { term: x.term, ...(e.target.value ? { detail: e.target.value } : {}) }
                    : x)),
                })}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={`حذف السطر ${i + 1}`}
                onClick={() => onChange({
                  ...block, items: block.items.filter((_, j) => j !== i),
                })}
                className="tappable flex min-h-touch min-w-touch items-center justify-center text-small text-ink3 transition-colors duration-base ease-out hover:text-danger"
              >
                حذف
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={block.items.length >= LIMITS.noteItems}
            onClick={() => onChange({ ...block, items: [...block.items, { term: '' }] })}
            className="tappable flex min-h-touch items-center text-small text-accent transition-opacity duration-base ease-out disabled:opacity-disabled"
          >
            + سطر
          </button>
        </div>
      );

    case 'image':
      return (
        <>
          <ImageField
            id={id('file')}
            pageId={pageId}
            mediaKey={block.mediaKey}
            image={images[block.mediaKey]}
            alt={block.alt}
            onUploaded={(key, image) => {
              onImage(key, image);
              onChange({ ...block, mediaKey: key });
            }}
          />
          <Text
            id={id('alt')} label="الوصف البديل — مطلوب" value={block.alt}
            maxLength={LIMITS.alt}
            onChange={(alt) => onChange({ ...block, alt })}
          />
          <Text
            id={id('cap')} label="تعليق — اختياري" value={block.caption ?? ''}
            maxLength={LIMITS.caption}
            onChange={(v) => onChange(
              v.trim()
                ? { ...block, caption: v }
                : { kind: 'image', mediaKey: block.mediaKey, alt: block.alt },
            )}
          />
        </>
      );

    case 'divider':
      return <p className="text-small text-ink3">فاصل بصري، بلا محتوى.</p>;

    case 'call_to_action':
      return (
        <>
          <Text
            id={id('label')} label="نص الزر" value={block.label}
            maxLength={LIMITS.ctaLabel}
            onChange={(label) => onChange({ ...block, label })}
          />
          <Text
            id={id('href')} label="المسار — داخلي فقط، يبدأ بـ /" value={block.href} ltr
            onChange={(href) => onChange({ ...block, href })}
          />
        </>
      );
  }
}

/** A fresh block of each kind, so "add" never produces something invalid. */
function emptyBlock(kind: BlockKind): Block {
  switch (kind) {
    case 'heading': return { kind, level: 2, text: '' };
    case 'passage': return { kind, text: '' };
    case 'pull_quote': return { kind, text: '' };
    case 'note_list': return { kind, items: [{ term: '' }] };
    case 'image': return { kind, mediaKey: '', alt: '' };
    case 'divider': return { kind };
    case 'call_to_action': return { kind, label: '', href: '/' };
  }
}

/* ---------------------------------------------------------------- editor */

export function PageEditor({ page }: {
  page: {
    id: string;
    slug: string;
    title: string;
    state: PageState;
    isLive: boolean;
    blocks: Block[];
    titleEn: string | null;
    blocksEn: Block[];
    images: ContentImages;
    canMoveTo: PageState[];
    objections: PublishObjection[];
  };
}) {
  const [title, setTitle] = useState(page.title);
  const [blocks, setBlocks] = useState<Block[]>(page.blocks);
  /*
   * The English half (D-3), edited in the same editor behind a switch. One
   * draft, two languages, saved together and published together — so an
   * English page can never go live ahead of, or behind, the Arabic it
   * translates. Empty English means "not translated": the site shows Arabic.
   */
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [titleEn, setTitleEn] = useState(page.titleEn ?? '');
  const [blocksEn, setBlocksEn] = useState<Block[]>(page.blocksEn);
  const english = language === 'en';
  const current = english ? blocksEn : blocks;
  const setCurrent = english ? setBlocksEn : setBlocks;
  // Grows as images are uploaded, so a new picture shows before the next save.
  const [images, setImages] = useState<ContentImages>(page.images);
  const [state, setState] = useState<PageState>(page.state);
  const [canMoveTo, setCanMoveTo] = useState<PageState[]>(page.canMoveTo);
  const [objections, setObjections] = useState<readonly PublishObjection[]>(page.objections);
  const [message, setMessage] = useState<string | null>(null);
  /*
   * LIVE is not the same as `state === 'published'`.
   *
   * A published page pulled back to draft is still on the site — that is the
   * rule the whole content design turns on — so this follows the revision, not
   * the state, exactly as the domain's `isVisible` does.
   */
  const isLive = page.isLive && state !== 'archived';
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /** Any edit invalidates the last save, so the button stops claiming success. */
  const edit = (next: Block[]) => { setCurrent(next); setSaved(false); };

  const replace = (index: number, block: Block) =>
    edit(current.map((b, i) => (i === index ? block : b)));

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= current.length) return;
    const next = [...current];
    [next[index], next[to]] = [next[to]!, next[index]!];
    edit(next);
  };

  const save = () => startTransition(async () => {
    const result = await savePageDraft(page.id, title, blocks, titleEn, blocksEn);
    setMessage(result.ok ? null : result.message ?? 'تعذّر الحفظ.');
    setObjections(result.objections ?? []);
    setSaved(result.ok);
  });

  const go = (to: PageState) => startTransition(async () => {
    /*
     * Save first, then move.
     *
     * The server publishes what is STORED, not what is on screen, so
     * publishing without saving would freeze the previous draft into a
     * revision and show the editor their unsaved text next to the word
     * "published". Two writes, but the alternative is a lie.
     */
    const write = await savePageDraft(page.id, title, blocks, titleEn, blocksEn);
    if (!write.ok) {
      setMessage(write.message ?? 'تعذّر الحفظ.');
      return;
    }

    const result = await movePageTo(page.id, to);
    setObjections(result.objections ?? []);
    setMessage(result.ok ? null : result.message ?? 'تعذّر التنفيذ.');
    if (result.ok) {
      setSaved(true);
      // Both come back from the server, which owns the transition table. The
      // first version cleared them and left the operator looking at a screen
      // with no actions on it until they reloaded.
      if (result.state) setState(result.state);
      if (result.canMoveTo) setCanMoveTo([...result.canMoveTo]);
    }
  });

  return (
    <div className="px-5 lg:px-0">
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <span className={statusPill('accent')}>
          {STATE_LABELS[state]}
        </span>
        <span className="latin text-caption text-ink3">/{page.slug}</span>
        {/*
          A way to SEE the page. An editor working blind on a block list has no
          way to tell whether what they wrote reads well, and asking them to
          type the URL is asking them not to look.

          Only when it is actually live: a link to a page that 404s teaches an
          editor to distrust the link.
        */}
        {isLive && (
          <a
            href={`/${page.slug}`}
            target="_blank"
            rel="noreferrer"
            className="tappable flex min-h-touch items-center text-small text-accent transition-opacity duration-base ease-out hover:opacity-press"
          >
            عرض الصفحة ↗
          </a>
        )}
      </div>

      {/* ----------------------------------------------------- the language */}
      <div role="group" aria-label="لغة المحتوى" className="mb-6 inline-flex border border-line">
        {(['ar', 'en'] as const).map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={language === code}
            onClick={() => setLanguage(code)}
            className={[
              'flex min-h-touch items-center px-5 text-small transition-colors duration-base ease-out',
              code === 'en' ? 'border-s border-line' : '',
              language === code ? 'bg-raised text-ink' : 'text-ink3 hover:text-ink2',
            ].join(' ')}
          >
            {code === 'ar' ? 'العربية' : 'English'}
          </button>
        ))}
      </div>

      {english && (
        <p className="mb-5 max-w-proseMax text-small leading-relaxed text-ink3">
          النسخة الإنجليزية اختيارية. إن تُركت فارغة يعرض الموقع الإنجليزي هذه الصفحة بالعربية.
          تُحفظ وتُنشر مع العربية في الخطوة نفسها.
        </p>
      )}

      {english && blocksEn.length === 0 && blocks.length > 0 && (
        <button
          type="button"
          onClick={() => {
            // The same structure, to be translated in place: a translator
            // replaces the words rather than rebuilding the page.
            setBlocksEn(JSON.parse(JSON.stringify(blocks)) as Block[]);
            if (!titleEn) setTitleEn(title);
            setSaved(false);
          }}
          className="tappable mb-6 flex min-h-touch items-center border border-line px-4 text-small text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
        >
          ابدأ من النسخة العربية
        </button>
      )}

      <div dir={english ? 'ltr' : undefined} lang={english ? 'en' : undefined}>
      <Text
        id="page-title"
        label={english ? 'عنوان الصفحة بالإنجليزية' : 'عنوان الصفحة'}
        value={english ? titleEn : title}
        maxLength={160}
        onChange={(v) => { (english ? setTitleEn : setTitle)(v); setSaved(false); }}
      />

      {/* ------------------------------------------------------- the blocks */}
      <ol className="mt-7">
        {current.map((block, index) => (
          <li key={index} className="mb-4 border border-line bg-raised p-4">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
              <span className="text-small text-ink2">
                <span className="tnum latin">{index + 1}</span> · {KIND_LABELS[block.kind]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button" aria-label={`تحريك العنصر ${index + 1} لأعلى`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="tappable flex min-h-touch min-w-touch items-center justify-center text-small text-ink3 transition-colors duration-base ease-out hover:text-accent disabled:opacity-disabled"
                >
                  ↑
                </button>
                <button
                  type="button" aria-label={`تحريك العنصر ${index + 1} لأسفل`}
                  disabled={index === current.length - 1}
                  onClick={() => move(index, 1)}
                  className="tappable flex min-h-touch min-w-touch items-center justify-center text-small text-ink3 transition-colors duration-base ease-out hover:text-accent disabled:opacity-disabled"
                >
                  ↓
                </button>
                <button
                  type="button" aria-label={`حذف العنصر ${index + 1}`}
                  onClick={() => edit(current.filter((_, i) => i !== index))}
                  className="tappable flex min-h-touch min-w-touch items-center justify-center text-small text-ink3 transition-colors duration-base ease-out hover:text-danger"
                >
                  حذف
                </button>
              </div>
            </div>
            <BlockFields
              block={block}
              index={index}
              onChange={(b) => replace(index, b)}
              pageId={page.id}
              images={images}
              onImage={(key, image) => setImages((known) => ({ ...known, [key]: image }))}
            />
          </li>
        ))}
      </ol>

      {/* --------------------------------------------------------- adding */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        {BLOCK_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={current.length >= LIMITS.blocksPerPage}
            onClick={() => edit([...current, emptyBlock(kind)])}
            className="tappable flex min-h-touch items-center border border-line px-4 text-small text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
          >
            + {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      </div>

      {/* ----------------------------------------------------- objections */}
      {objections.length > 0 && (
        <ul className="mt-7 border-s-2 border-danger ps-4" aria-live="polite">
          {objections.map((objection, i) => (
            <li key={i} className="py-1 text-small leading-relaxed text-danger">
              {objectionText(objection)}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p role="alert" className="mt-5 text-small text-danger">{message}</p>
      )}

      {/* --------------------------------------------------------- actions */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <PrimaryButton type="button" disabled={pending} onClick={save} fill="auto">
          {pending ? '…' : saved ? 'تم الحفظ' : 'حفظ المسودة'}
        </PrimaryButton>

        {canMoveTo.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() => go(to)}
            className="tappable flex min-h-touch items-center border border-line px-5 text-bodyLg text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
          >
            {MOVE_LABELS[to]}
          </button>
        ))}
      </div>
    </div>
  );
}
