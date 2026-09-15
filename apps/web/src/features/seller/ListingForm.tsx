'use client';

/**
 * A house writing a listing.
 *
 * Twenty-four fields across six groups, which is a lot — and doc 04 §4 says
 * every one of them is required before a listing publishes. The design problem
 * is therefore not "how few fields" but "how does this not feel like a form".
 *
 * THREE THINGS DO THAT WORK.
 *
 * Grouped by what a person is thinking about, not by table order: identity,
 * then commerce, then the perfume itself, then how it wears, then the
 * compliance the platform needs. Somebody filling this in is answering five
 * questions, not twenty-four.
 *
 * What is missing is shown WHILE they work, not on submit. The count of
 * remaining gaps sits with the actions, so the form has an end in sight.
 *
 * And what is prohibited is shown the moment it is typed and saved, with the
 * matched words quoted. Being told after submission that a sentence was
 * refused teaches nothing about which sentence.
 */
import { useState, useTransition } from 'react';
import {
  CONCENTRATIONS, DAY_NIGHT, GENDER_POSITIONINGS, LONGEVITY_BANDS, OCCASIONS,
  PERFORMANCE_SOURCES, PRODUCT_FORMS, PROJECTION_BANDS, RETURN_ELIGIBILITIES,
  SCENT_FAMILIES, SEASONS,
  type ClaimFinding, type ListingDraft, type ListingGap, type ListingState,
  isListingEditableBySeller,
} from '@diyar/domain';
import { CURRENCY_LABEL, LISTING_STATE_AR, westernDigits } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import {
  archiveListing, saveListing, submitListing, withdrawListing,
} from './listing-actions';

/* ------------------------------------------------------------------ labels */

// Shared with the listing list and the audit screen; typed against the domain
// union so a new state cannot arrive without its word.
const STATE_LABELS: Record<ListingState, string> = LISTING_STATE_AR;

const MOVE_LABELS = {
  pending_moderation: 'إرسال للمراجعة',
  draft: 'سحب من المراجعة',
  archived: 'أرشفة',
} as const;

/**
 * Every vocabulary in Arabic.
 *
 * Typed as complete Records over the domain's lists, so a value added there
 * without wording here fails the build rather than rendering its own code name
 * on a seller's screen.
 */
const CONCENTRATION_LABELS: Record<(typeof CONCENTRATIONS)[number], string> = {
  parfum: 'بارفان',
  eau_de_parfum: 'أو دو بارفان',
  eau_de_toilette: 'أو دو تواليت',
  eau_de_cologne: 'كولونيا',
  oil: 'زيت',
  attar: 'عطر مركّز',
  body_mist: 'بخاخ للجسم',
};

const FORM_LABELS: Record<(typeof PRODUCT_FORMS)[number], string> = {
  spray: 'بخاخ', roll_on: 'رول أون', dab: 'دهان', solid: 'صلب',
};

const GENDER_LABELS: Record<(typeof GENDER_POSITIONINGS)[number], string> = {
  men: 'رجالي', women: 'نسائي', unisex: 'للجنسين',
};

const FAMILY_LABELS: Record<(typeof SCENT_FAMILIES)[number], string> = {
  oud: 'عود', amber: 'عنبر', woody: 'خشبي', floral: 'زهري',
  fresh: 'منعش', gourmand: 'حلو', musk: 'مسك',
};

const SEASON_LABELS: Record<(typeof SEASONS)[number], string> = {
  spring: 'الربيع', summer: 'الصيف', autumn: 'الخريف', winter: 'الشتاء',
};

const DAY_NIGHT_LABELS: Record<(typeof DAY_NIGHT)[number], string> = {
  day: 'نهارًا', night: 'ليلًا', both: 'الاثنين',
};

const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  daily: 'يومي', work: 'العمل', evening: 'السهرة', occasion: 'المناسبات', gift: 'هدية',
};

const PROJECTION_LABELS: Record<(typeof PROJECTION_BANDS)[number], string> = {
  intimate: 'قريب', moderate: 'متوسط', strong: 'قوي', enormous: 'واسع جدًا',
};

const LONGEVITY_LABELS: Record<(typeof LONGEVITY_BANDS)[number], string> = {
  weak: 'قصير', moderate: 'متوسط', long: 'طويل', very_long: 'طويل جدًا',
};

const SOURCE_LABELS: Record<(typeof PERFORMANCE_SOURCES)[number], string> = {
  seller_provided: 'من الدار', platform_test: 'اختبار المنصّة', review_aggregate: 'من التقييمات',
};

const RETURN_LABELS: Record<(typeof RETURN_ELIGIBILITIES)[number], string> = {
  sealed_only: 'مغلق فقط',
  sealed_or_defect: 'مغلق أو به عيب',
  defect_only: 'عند وجود عيب فقط',
  not_returnable: 'غير قابل للإرجاع',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'اسم العطر', slug: 'المسار', sku: 'رمز المنتج', brandId: 'الدار',
  pricePiastres: 'السعر', promoPricePiastres: 'سعر العرض', volumeMl: 'الحجم',
  stock: 'المخزون', fulfilmentHours: 'مدة التجهيز',
  concentration: 'التركيز', form: 'الشكل', genderPositioning: 'التوجّه',
  scentFamily: 'العائلة العطرية',
  notesTop: 'نفحات القمة', notesHeart: 'نفحات القلب', notesBase: 'نفحات القاعدة',
  seasons: 'الفصول', dayNight: 'الوقت', occasions: 'المناسبات',
  projectionBand: 'الانتشار', longevityBand: 'الثبات', performanceSource: 'مصدر البيانات',
  responsiblePartyName: 'الجهة المسؤولة', returnEligibility: 'سياسة الإرجاع',
  defectRoute: 'مسار العيوب', primaryImage: 'الصورة الرئيسية',
};

const CLAIM_LABELS: Record<ClaimFinding['code'], string> = {
  similarity_percentage: 'ادّعاء تطابق بنسبة مئوية — ممنوع نهائيًا',
  replica_claim: 'ادّعاء أن المنتج نسخة من عطر آخر — ممنوع نهائيًا',
  authorisation_claim: 'ادّعاء وكالة أو ترخيص — يحتاج مستندات',
  designer_reference: 'ذكر دار عطور أخرى — يحتاج مراجعة قانونية',
};

/* ------------------------------------------------------------------ atoms */

const control = [
  'h-control w-full rounded-sm border border-line bg-ground px-3 text-body text-ink',
  'transition-colors duration-base ease-out',
  'focus:border-ink2 focus:outline-none focus-visible:border-accent',
].join(' ');

function Row({ label, htmlFor, hint, children }: {
  label: string; htmlFor: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-caption tracking-label text-ink3">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-micro leading-relaxed text-ink3">{hint}</p>}
    </div>
  );
}

function Choice<T extends string>({
  id, label, value, options, labels, onChange, hint,
}: {
  id: string; label: string; value: T | null | undefined;
  options: readonly T[]; labels: Record<T, string>;
  onChange(v: T | null): void; hint?: string;
}) {
  return (
    <Row label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={control}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option]}</option>
        ))}
      </select>
    </Row>
  );
}

/** Multi-select as toggles. A native multiple-select is unusable on a phone. */
function Toggles<T extends string>({
  label, values, options, labels, onChange,
}: {
  label: string; values: readonly T[] | null | undefined;
  options: readonly T[]; labels: Record<T, string>; onChange(v: T[]): void;
}) {
  const chosen = new Set(values ?? []);
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-caption tracking-label text-ink3">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = chosen.has(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(
                on ? [...chosen].filter((x) => x !== option) : [...chosen, option],
              )}
              className={[
                'tappable flex min-h-touch items-center rounded-sm border px-4 text-small',
                'transition-colors duration-base ease-out',
                on
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-ink2 hover:border-ink2 hover:text-ink',
              ].join(' ')}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Notes, one per line. A comma-separated field turns into a parsing argument. */
function Notes({ id, label, value, onChange }: {
  id: string; label: string; value: readonly string[] | null | undefined;
  onChange(v: string[]): void;
}) {
  return (
    <Row label={label} htmlFor={id} hint="نفحة في كل سطر">
      <textarea
        id={id}
        rows={3}
        value={(value ?? []).join('\n')}
        onChange={(e) => onChange(
          e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
        )}
        className="min-h-touch w-full rounded-sm border border-line bg-ground px-3 py-3 text-body leading-relaxed text-ink transition-colors duration-base ease-out focus:border-ink2 focus:outline-none focus-visible:border-accent"
      />
    </Row>
  );
}

/** Money in whole pounds on screen, integer piastres underneath. */
function Money({ id, label, piastres, onChange, hint }: {
  id: string; label: string; piastres: number | null | undefined;
  onChange(v: number | null): void; hint?: string;
}) {
  return (
    <Row label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          inputMode="numeric"
          value={piastres === null || piastres === undefined ? '' : String(piastres / 100)}
          onChange={(e) => {
            // The same normalisation the checkout field does: an Egyptian
            // keyboard produces ٠١٢ and every validator below reads Western.
            const raw = westernDigits(e.target.value).replace(/[^\d.]/g, '');
            onChange(raw === '' ? null : Math.round(Number(raw) * 100));
          }}
          className={`${control} tnum`}
        />
        <span className="latin text-caption tracking-label text-ink3">{CURRENCY_LABEL}</span>
      </div>
    </Row>
  );
}

function Count({ id, label, value, onChange, hint }: {
  id: string; label: string; value: number | null | undefined;
  onChange(v: number | null): void; hint?: string;
}) {
  return (
    <Row label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <input
        id={id}
        inputMode="numeric"
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => {
          const raw = westernDigits(e.target.value).replace(/[^\d]/g, '');
          onChange(raw === '' ? null : Number(raw));
        }}
        className={`${control} tnum`}
      />
    </Row>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9 border-t border-line pt-6">
      <h2 className="mb-5 font-display text-h4 text-ink">{title}</h2>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- editor */

type Draft = Record<string, unknown>;

/**
 * What the page hands in.
 *
 * The editable fields are declared with `ListingDraft` rather than an index
 * signature: an interface does not satisfy `Record<string, unknown>` in
 * TypeScript, so intersecting the two made every caller a type error while
 * looking like it should work.
 */
export interface ListingFormInput extends ListingDraft {
  id: string;
  state: ListingState;
  primaryImage: boolean;
  canMoveTo: ListingState[];
  gaps: ListingGap[];
  claims: ClaimFinding[];
}

export function ListingForm({ listing }: { listing: ListingFormInput }) {
  const [draft, setDraft] = useState<Draft>({ ...listing });
  const [state, setState] = useState<ListingState>(listing.state);
  const [gaps, setGaps] = useState<readonly ListingGap[]>(listing.gaps);
  const [claims, setClaims] = useState<readonly ClaimFinding[]>(listing.claims);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (field: string, value: unknown) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setSaved(false);
  };

  /** Only the fields the schema accepts. The rest is read-only context. */
  const payload = (): Draft => {
    const keys = [
      'name', 'sku', 'pricePiastres', 'promoPricePiastres', 'volumeMl', 'stock',
      'fulfilmentHours', 'concentration', 'form', 'genderPositioning', 'scentFamily',
      'notesTop', 'notesHeart', 'notesBase', 'seasons', 'dayNight', 'occasions',
      'projectionBand', 'longevityBand', 'performanceSource', 'responsiblePartyName',
      'returnEligibility', 'defectRoute',
    ];
    return Object.fromEntries(
      keys.filter((k) => draft[k] !== undefined).map((k) => [k, draft[k]]),
    );
  };

  const save = () => startTransition(async () => {
    const result = await saveListing(listing.id, payload());
    setMessage(result.ok ? null : result.message ?? 'تعذّر الحفظ.');
    setGaps(result.gaps ?? []);
    setClaims(result.claims ?? []);
    setSaved(result.ok);
  });

  const move = (to: ListingState) => startTransition(async () => {
    // Save first: the server decides on what is STORED, and submitting unsaved
    // work would judge the previous version while showing this one.
    const write = await saveListing(listing.id, payload());
    if (!write.ok) { setMessage(write.message ?? 'تعذّر الحفظ.'); return; }

    const result = to === 'pending_moderation'
      ? await submitListing(listing.id)
      : to === 'draft'
        ? await withdrawListing(listing.id)
        : await archiveListing(listing.id);

    setGaps(result.gaps ?? write.gaps ?? []);
    setClaims(result.claims ?? write.claims ?? []);
    setMessage(result.ok ? null : result.message ?? 'تعذّر التنفيذ.');
    if (result.ok) { setState(to); setSaved(true); }
  });

  const refused = claims.some((c) => c.severity === 'refused');
  // The domain's rule, shared with the photograph screen and its endpoints.
  const readOnly = !isListingEditableBySeller(state);

  return (
    <div className="px-5 lg:px-0">
      <div className="mb-7 flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <span className="rounded-pill bg-accent/15 px-3 py-1 text-micro tracking-label text-accent">
          {STATE_LABELS[state]}
        </span>
        {listing.slug && <span className="latin text-caption text-ink3">/p/{listing.slug}</span>}
        {state === 'published' && (
          <a
            href={`/p/${listing.slug}`}
            target="_blank"
            rel="noreferrer"
            className="tappable flex min-h-touch items-center text-caption tracking-label text-accent"
          >
            عرض في المتجر ↗
          </a>
        )}
      </div>

      {readOnly && (
        <p className="mb-7 border-s-2 border-accent/60 ps-4 text-small leading-relaxed text-ink2">
          {state === 'pending_moderation'
            ? 'المنتج قيد المراجعة. اسحبه من المراجعة إذا أردت تعديله.'
            : 'المنتج مؤرشف. أعِده إلى المسودة للتعديل.'}
        </p>
      )}

      <fieldset disabled={readOnly || pending} className="disabled:opacity-disabled">
        <Group title="التعريف">
          <Row label={FIELD_LABELS.name!} htmlFor="f-name">
            <input
              id="f-name" value={String(draft.name ?? '')} maxLength={160}
              onChange={(e) => set('name', e.target.value)} className={control}
            />
          </Row>
          <Row label={FIELD_LABELS.sku!} htmlFor="f-sku" hint="رمزك الداخلي، حروف لاتينية وأرقام">
            <input
              id="f-sku" value={String(draft.sku ?? '')} maxLength={60} dir="ltr"
              onChange={(e) => set('sku', e.target.value)}
              className={`${control} latin text-start`}
            />
          </Row>
        </Group>

        <Group title="البيع">
          <Money id="f-price" label={FIELD_LABELS.pricePiastres!}
            piastres={draft.pricePiastres as number | null}
            onChange={(v) => set('pricePiastres', v)} />
          <Money id="f-promo" label={FIELD_LABELS.promoPricePiastres!}
            piastres={draft.promoPricePiastres as number | null}
            hint="اختياري، ولا بد أن يكون أقل من السعر"
            onChange={(v) => set('promoPricePiastres', v)} />
          <Count id="f-volume" label={`${FIELD_LABELS.volumeMl!} (مل)`}
            value={draft.volumeMl as number | null} onChange={(v) => set('volumeMl', v)} />
          <Count id="f-stock" label={FIELD_LABELS.stock!}
            value={draft.stock as number | null} onChange={(v) => set('stock', v)} />
          <Count id="f-hours" label={`${FIELD_LABELS.fulfilmentHours!} (ساعة)`}
            value={draft.fulfilmentHours as number | null}
            hint="الوقت الذي تتعهّد بتجهيز الطلب خلاله"
            onChange={(v) => set('fulfilmentHours', v)} />
        </Group>

        <Group title="العطر">
          <Choice id="f-conc" label={FIELD_LABELS.concentration!}
            value={draft.concentration as never} options={CONCENTRATIONS}
            labels={CONCENTRATION_LABELS} onChange={(v) => set('concentration', v)} />
          <Choice id="f-form" label={FIELD_LABELS.form!}
            value={draft.form as never} options={PRODUCT_FORMS}
            labels={FORM_LABELS} onChange={(v) => set('form', v)} />
          <Choice id="f-gender" label={FIELD_LABELS.genderPositioning!}
            value={draft.genderPositioning as never} options={GENDER_POSITIONINGS}
            labels={GENDER_LABELS} onChange={(v) => set('genderPositioning', v)} />
          <Choice id="f-family" label={FIELD_LABELS.scentFamily!}
            value={draft.scentFamily as never} options={SCENT_FAMILIES}
            labels={FAMILY_LABELS} onChange={(v) => set('scentFamily', v)} />
          <Notes id="f-top" label={FIELD_LABELS.notesTop!}
            value={draft.notesTop as string[]} onChange={(v) => set('notesTop', v)} />
          <Notes id="f-heart" label={FIELD_LABELS.notesHeart!}
            value={draft.notesHeart as string[]} onChange={(v) => set('notesHeart', v)} />
          <Notes id="f-base" label={FIELD_LABELS.notesBase!}
            value={draft.notesBase as string[]} onChange={(v) => set('notesBase', v)} />
        </Group>

        <Group title="الاستعمال">
          <Toggles label={FIELD_LABELS.seasons!} values={draft.seasons as never}
            options={SEASONS} labels={SEASON_LABELS} onChange={(v) => set('seasons', v)} />
          <Toggles label={FIELD_LABELS.occasions!} values={draft.occasions as never}
            options={OCCASIONS} labels={OCCASION_LABELS} onChange={(v) => set('occasions', v)} />
          <Choice id="f-daynight" label={FIELD_LABELS.dayNight!}
            value={draft.dayNight as never} options={DAY_NIGHT}
            labels={DAY_NIGHT_LABELS} onChange={(v) => set('dayNight', v)} />
          <Choice id="f-projection" label={FIELD_LABELS.projectionBand!}
            value={draft.projectionBand as never} options={PROJECTION_BANDS}
            labels={PROJECTION_LABELS} onChange={(v) => set('projectionBand', v)} />
          <Choice id="f-longevity" label={FIELD_LABELS.longevityBand!}
            value={draft.longevityBand as never} options={LONGEVITY_BANDS}
            labels={LONGEVITY_LABELS} onChange={(v) => set('longevityBand', v)} />
          <Choice id="f-source" label={FIELD_LABELS.performanceSource!}
            value={draft.performanceSource as never} options={PERFORMANCE_SOURCES}
            labels={SOURCE_LABELS} onChange={(v) => set('performanceSource', v)}
            hint="من أين جاءت أرقام الثبات والانتشار — مطلوب، ولا يُنشر تقدير دون مصدر" />
        </Group>

        <Group title="الالتزامات">
          <Row label={FIELD_LABELS.responsiblePartyName!} htmlFor="f-responsible"
            hint="الاسم الذي يتحمّل مسؤولية المنتج أمام العميل">
            <input
              id="f-responsible" value={String(draft.responsiblePartyName ?? '')} maxLength={200}
              onChange={(e) => set('responsiblePartyName', e.target.value)} className={control}
            />
          </Row>
          <Choice id="f-return" label={FIELD_LABELS.returnEligibility!}
            value={draft.returnEligibility as never} options={RETURN_ELIGIBILITIES}
            labels={RETURN_LABELS} onChange={(v) => set('returnEligibility', v)} />
          <Row label={FIELD_LABELS.defectRoute!} htmlFor="f-defect"
            hint="ماذا يحدث إذا وصل المنتج به عيب">
            <textarea
              id="f-defect" rows={3} value={String(draft.defectRoute ?? '')} maxLength={500}
              onChange={(e) => set('defectRoute', e.target.value)}
              className="min-h-touch w-full rounded-sm border border-line bg-ground px-3 py-3 text-body leading-relaxed text-ink transition-colors duration-base ease-out focus:border-ink2 focus:outline-none focus-visible:border-accent"
            />
          </Row>
        </Group>
      </fieldset>

      {/* ------------------------------------------------------ what is wrong */}

      {claims.length > 0 && (
        <ul
          className={`mb-6 border-s-2 ps-4 ${refused ? 'border-danger/60' : 'border-accent/60'}`}
          aria-live="polite"
        >
          {claims.map((claim, i) => (
            <li key={i} className={`py-1.5 text-small leading-relaxed ${refused ? 'text-danger' : 'text-ink2'}`}>
              {CLAIM_LABELS[claim.code]}
              {/* The matched words, quoted. "A prohibited claim" tells a house
                  nothing about which sentence to change. */}
              <span className="text-ink3"> — «{claim.evidence}»</span>
            </li>
          ))}
        </ul>
      )}

      {gaps.length > 0 && (
        <div className="mb-6 border-s-2 border-line ps-4">
          <p className="mb-2 text-caption tracking-label text-ink3">
            ناقص قبل الإرسال · <span className="tnum">{gaps.length}</span>
          </p>
          <p className="text-small leading-relaxed text-ink2">
            {gaps.map((gap) => FIELD_LABELS[gap.field] ?? gap.field).join(' · ')}
          </p>
        </div>
      )}

      {!listing.primaryImage && (
        <p className="mb-6 border-s-2 border-line ps-4 text-small leading-relaxed text-ink2">
          أضف صورة رئيسية من قسم «الصور» أعلاه. المنتج لا يُنشر بدونها.
        </p>
      )}

      {message && <p role="alert" className="mb-5 text-small text-danger">{message}</p>}

      {/* ----------------------------------------------------------- actions */}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {!readOnly && (
          <PrimaryButton type="button" fill="auto" disabled={pending} onClick={save}>
            {pending ? '…' : saved ? 'تم الحفظ' : 'حفظ'}
          </PrimaryButton>
        )}

        {listing.canMoveTo
          .filter((to): to is keyof typeof MOVE_LABELS => to in MOVE_LABELS)
          .map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending || (to === 'pending_moderation' && (gaps.length > 0 || refused))}
              onClick={() => move(to)}
              className="tappable flex min-h-touch items-center rounded-sm border border-line px-5 text-bodyLg text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
            >
              {MOVE_LABELS[to]}
            </button>
          ))}
      </div>
    </div>
  );
}
