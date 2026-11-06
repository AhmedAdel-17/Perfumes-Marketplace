'use client';
import { localePath } from '@diyar/i18n';
import { useSellerCopy } from '@/features/seller/use-seller-copy';


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
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { statusPill } from '@/features/shell/status-pill';
import {
  CONCENTRATIONS, DAY_NIGHT, GENDER_POSITIONINGS, LONGEVITY_BANDS, OCCASIONS,
  PERFORMANCE_SOURCES, PRODUCT_FORMS, PROJECTION_BANDS, RETURN_ELIGIBILITIES,
  SCENT_FAMILIES, SEASONS,
  type ClaimFinding, type ListingDraft, type ListingGap, type ListingState,
  isListingEditableBySeller, nextListingStates,
} from '@diyar/domain';
import { CURRENCY_LABEL, LISTING_STATE_AR, westernDigits } from '@diyar/i18n';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import {
  archiveListing, saveListing, submitListing, withdrawListing, type ListingResult,
} from './listing-actions';

/* ------------------------------------------------------------------ labels */

// Shared with the listing list and the audit screen; typed against the domain
// union so a new state cannot arrive without its word.
const STATE_LABELS: Record<ListingState, string> = LISTING_STATE_AR;

const MOVE_LABELS = {
  pending_moderation: "Submit for review",
  draft: "Withdraw from review",
  archived: "Archive",
} as const;

/**
 * Every vocabulary in Arabic.
 *
 * Typed as complete Records over the domain's lists, so a value added there
 * without wording here fails the build rather than rendering its own code name
 * on a seller's screen.
 */
const CONCENTRATION_LABELS: Record<(typeof CONCENTRATIONS)[number], string> = {
  parfum: "Parfum",
  eau_de_parfum: "Eau de parfum",
  eau_de_toilette: "Eau de toilette",
  eau_de_cologne: "Eau de cologne",
  oil: "Perfume oil",
  attar: "Attar",
  body_mist: "Body mist",
};

const FORM_LABELS: Record<(typeof PRODUCT_FORMS)[number], string> = {
  spray: "Spray", roll_on: "Roll-on", dab: "Dab", solid: "Solid",
};

const GENDER_LABELS: Record<(typeof GENDER_POSITIONINGS)[number], string> = {
  men: "For men", women: "For women", unisex: "Unisex",
};

const FAMILY_LABELS: Record<(typeof SCENT_FAMILIES)[number], string> = {
  oud: "Oud", amber: "Amber", woody: "Woody", floral: "Floral",
  fresh: "Fresh", gourmand: "Gourmand", musk: "Musk",
};

const SEASON_LABELS: Record<(typeof SEASONS)[number], string> = {
  spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter",
};

const DAY_NIGHT_LABELS: Record<(typeof DAY_NIGHT)[number], string> = {
  day: "Day", night: "Night", both: "Both",
};

const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  daily: "Everyday", work: "Work", evening: "Evening", occasion: "Occasions", gift: "Gift",
};

const PROJECTION_LABELS: Record<(typeof PROJECTION_BANDS)[number], string> = {
  intimate: "INTIMATE", moderate: "Moderate", strong: "STRONG", enormous: "Enormous",
};

const LONGEVITY_LABELS: Record<(typeof LONGEVITY_BANDS)[number], string> = {
  weak: "Short", moderate: "Moderate", long: "LONG", very_long: "VERY LONG",
};

const SOURCE_LABELS: Record<(typeof PERFORMANCE_SOURCES)[number], string> = {
  seller_provided: "Seller provided", platform_test: "Platform test", review_aggregate: "Review aggregate",
};

const RETURN_LABELS: Record<(typeof RETURN_ELIGIBILITIES)[number], string> = {
  sealed_only: "Sealed only",
  sealed_or_defect: "Sealed or defective",
  defect_only: "Defective only",
  not_returnable: "Not returnable",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Perfume name", nameEn: "English name", slug: "URL", sku: "SKU", brandId: "House",
  pricePiastres: "Price", promoPricePiastres: "Promotional price", volumeMl: "Volume",
  stock: "Stock", fulfilmentHours: "Preparation time",
  concentration: "Concentration", form: "Format", genderPositioning: "Gender positioning",
  scentFamily: "Fragrance family",
  notesTop: "Top notes", notesHeart: "Heart notes", notesBase: "Base notes",
  seasons: "Seasons", dayNight: "Time of day", occasions: "Occasions",
  projectionBand: "Projection", longevityBand: "Longevity", performanceSource: "Performance source",
  responsiblePartyName: "Responsible party", returnEligibility: "Return eligibility",
  defectRoute: "Defect process", primaryImage: "Primary photograph",
};

const CLAIM_LABELS: Record<ClaimFinding['code'], string> = {
  similarity_percentage: "Percentage similarity claim — prohibited",
  replica_claim: "Replica claim — prohibited",
  authorisation_claim: "Authorisation claim — evidence required",
  designer_reference: "Designer reference — legal review required",
};

/* ------------------------------------------------------------------ atoms */

const control = [
  'h-control w-full border border-line bg-sunken px-3 text-body text-ink',
  'transition-colors duration-base ease-out',
  'focus:border-ink focus:outline-none',
].join(' ');

function Row({ label, htmlFor, hint, children }: {
  label: string; htmlFor: string; hint?: string; children: React.ReactNode;
}) {
  const { t } = useSellerCopy();

  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-small text-ink3">
        {t(label)}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-small leading-relaxed text-ink3">{hint}</p>}
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
  const { t } = useSellerCopy();

  return (
    <Row label={t(label)} htmlFor={id} {...(hint ? { hint } : {})}>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={control}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>{t(labels[option])}</option>
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
  const { t } = useSellerCopy();

  const chosen = new Set(values ?? []);
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-small text-ink3">{t(label)}</legend>
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
                'tappable flex min-h-touch items-center border px-4 text-small',
                'transition-colors duration-base ease-out',
                on
                  // No tint behind the chosen chip: accent on a 10% accent fill
                  // is the pill failure again. The border, the ink and
                  // `aria-pressed` carry the choice.
                  ? 'border-accent text-accent'
                  : 'border-line text-ink2 hover:border-ink2 hover:text-ink',
              ].join(' ')}
            >
              {t(labels[option])}
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
  const { t } = useSellerCopy();

  return (
    <Row label={t(label)} htmlFor={id} hint={t("One note per line")}>
      <textarea
        id={id}
        rows={3}
        value={(value ?? []).join('\n')}
        onChange={(e) => onChange(
          e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
        )}
        className="min-h-touch w-full border border-line bg-ground px-3 py-3 text-body leading-relaxed text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
      />
    </Row>
  );
}

/** Money in whole pounds on screen, integer piastres underneath. */
function Money({ id, label, piastres, onChange, hint }: {
  id: string; label: string; piastres: number | null | undefined;
  onChange(v: number | null): void; hint?: string;
}) {
  const { t } = useSellerCopy();

  return (
    <Row label={t(label)} htmlFor={id} {...(hint ? { hint } : {})}>
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
        <span className="latin text-caption tracking-label text-ink3">{t(CURRENCY_LABEL)}</span>
      </div>
    </Row>
  );
}

function Count({ id, label, value, onChange, hint }: {
  id: string; label: string; value: number | null | undefined;
  onChange(v: number | null): void; hint?: string;
}) {
  const { t } = useSellerCopy();

  return (
    <Row label={t(label)} htmlFor={id} {...(hint ? { hint } : {})}>
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
    <section className="mb-5 border border-line bg-ground p-5 lg:p-6">
      <h2 className="mb-5 border-b border-line pb-4 font-display text-h4 text-ink">{title}</h2>
      <div className="grid gap-x-6 md:grid-cols-2">{children}</div>
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
  const { locale, t, errorText } = useSellerCopy();

  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...listing });
  const [state, setState] = useState<ListingState>(listing.state);
  const [gaps, setGaps] = useState<readonly ListingGap[]>(listing.gaps);
  const [claims, setClaims] = useState<readonly ClaimFinding[]>(listing.claims);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Photo changes refresh the server payload without remounting this editor.
  // Refresh publish eligibility, but preserve the seller's unsaved field edits.
  useEffect(() => {
    setGaps(listing.gaps);
    setClaims(listing.claims);
    setState(listing.state);
  }, [listing.gaps, listing.claims, listing.state]);

  const set = (field: string, value: unknown) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setSaved(false);
  };

  /** Only the fields the schema accepts. The rest is read-only context. */
  const payload = (): Draft => {
    const keys = [
      'name', 'nameEn', 'sku', 'pricePiastres', 'promoPricePiastres', 'volumeMl', 'stock',
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
    setMessage(null);
    try {
      const result = await saveListing(listing.id, payload());
      setMessage(result.ok ? null : result.message ?? t("Could not save."));
      setGaps(result.gaps ?? []);
      setClaims(result.claims ?? []);
      setSaved(result.ok);
    } catch {
      setMessage(t("Could not connect. Your edits are still here; check your connection and save again."));
      setSaved(false);
    }
  });

  const move = (to: ListingState) => startTransition(async () => {
    setMessage(null);
    try {
      // Save editable work before submitting. Locked pending/archived listings
      // must transition directly: saving them is deliberately forbidden by the API.
      const write: ListingResult = isListingEditableBySeller(state)
        ? await saveListing(listing.id, payload()) : { ok: true };
      if (!write.ok) { setMessage(write.message ?? t("Could not save.")); return; }
      const result = to === 'pending_moderation'
        ? await submitListing(listing.id)
        : to === 'draft'
          ? await withdrawListing(listing.id)
          : await archiveListing(listing.id);
      setGaps(result.gaps ?? write.gaps ?? gaps);
      setClaims(result.claims ?? write.claims ?? claims);
      setMessage(result.ok ? null : result.message ?? t("Could not complete the action."));
      if (result.ok) { setState(to); setSaved(true); router.refresh(); }
    } catch {
      setMessage(t("Could not verify the result. Reload the product status before repeating the action."));
      setSaved(false);
    }
  });

  const refused = claims.some((c) => c.severity === 'refused');
  // The domain's rule, shared with the photograph screen and its endpoints.
  const readOnly = !isListingEditableBySeller(state);

  return (
    <div aria-busy={pending}>
      <div className="mb-7 flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <span className={statusPill(state === 'suspended' ? 'danger' : state === 'published' ? 'accent' : 'quiet')}>
          {t(STATE_LABELS[state])}
        </span>
        {listing.slug && <span className="latin text-caption text-ink3">/p/{listing.slug}</span>}
        {state === 'published' && (
          <a
            href={localePath(locale,`/p/${listing.slug}`)}
            target="_blank"
            rel="noreferrer"
            className="tappable flex min-h-touch items-center text-small text-accent"
          >
            {t(" View in shop ↗ ")}</a>
        )}
      </div>

      {!readOnly && (
        <p className="mb-6 text-small leading-relaxed text-ink2">
          {t(" Complete and save the product details before submitting for review. The platform team approves publication. ")}</p>
      )}

      {readOnly && (
        <p className="mb-7 border-s-2 border-accent ps-4 text-small leading-relaxed text-ink2">
          {state === 'pending_moderation'
            ? t("This product is under review. Withdraw it before making changes.")
            : t("This product is archived. Restore it to draft before editing.")}
        </p>
      )}

      <fieldset disabled={readOnly || pending} className="disabled:opacity-disabled">
        <Group title={t("1 · Product identity")}>
          <Row label={t(FIELD_LABELS.name!)} htmlFor="f-name">
            <input
              id="f-name" value={String(draft.name ?? '')} maxLength={160}
              onChange={(e) => set('name', e.target.value)} className={control}
            />
          </Row>
          {/*
            Optional. The English site shows this name when it is filled and the
            Arabic one when it is not — so a house that has no English name
            loses nothing by leaving it empty.
          */}
          <Row
            label={`${t(FIELD_LABELS.nameEn!)}${t(" (optional)")}`}
            htmlFor="f-name-en"
            hint={t("As written on the bottle or your house account. Shown on the English storefront.")}
          >
            <input
              id="f-name-en" value={String(draft.nameEn ?? '')} maxLength={160} dir="ltr" lang="en"
              onChange={(e) => set('nameEn', e.target.value)} className={control}
            />
          </Row>
          <Row label={t(FIELD_LABELS.sku!)} htmlFor="f-sku" hint={t("Your internal code, using Latin letters and numbers.")}>
            <input
              id="f-sku" value={String(draft.sku ?? '')} maxLength={60} dir="ltr"
              onChange={(e) => set('sku', e.target.value)}
              className={`${control} latin text-start`}
            />
          </Row>
        </Group>

        <Group title={t("2 · Price, stock and preparation")}>
          <Money id="f-price" label={t(FIELD_LABELS.pricePiastres!)}
            piastres={draft.pricePiastres as number | null}
            onChange={(v) => set('pricePiastres', v)} />
          <Money id="f-promo" label={t(FIELD_LABELS.promoPricePiastres!)}
            piastres={draft.promoPricePiastres as number | null}
            hint={t("Optional; must be lower than the regular price.")}
            onChange={(v) => set('promoPricePiastres', v)} />
          <Count id="f-volume" label={`${t(FIELD_LABELS.volumeMl!)}${t(" (ml)")}`}
            value={draft.volumeMl as number | null} onChange={(v) => set('volumeMl', v)} />
          <Count id="f-stock" label={t("Recorded stock")}
            hint={t("The recorded product quantity. Reservations and movement history are not shown here.")}
            value={draft.stock as number | null} onChange={(v) => set('stock', v)} />
          <Count id="f-hours" label={`${t(FIELD_LABELS.fulfilmentHours!)}${t(" (hours)")}`}
            value={draft.fulfilmentHours as number | null}
            hint={t("The time you commit to preparing an order.")}
            onChange={(v) => set('fulfilmentHours', v)} />
        </Group>

        <Group title={t("3 · Fragrance and notes")}>
          <Choice id="f-conc" label={t(FIELD_LABELS.concentration!)}
            value={draft.concentration as never} options={CONCENTRATIONS}
            labels={CONCENTRATION_LABELS} onChange={(v) => set('concentration', v)} />
          <Choice id="f-form" label={t(FIELD_LABELS.form!)}
            value={draft.form as never} options={PRODUCT_FORMS}
            labels={FORM_LABELS} onChange={(v) => set('form', v)} />
          <Choice id="f-gender" label={t(FIELD_LABELS.genderPositioning!)}
            value={draft.genderPositioning as never} options={GENDER_POSITIONINGS}
            labels={GENDER_LABELS} onChange={(v) => set('genderPositioning', v)} />
          <Choice id="f-family" label={t(FIELD_LABELS.scentFamily!)}
            value={draft.scentFamily as never} options={SCENT_FAMILIES}
            labels={FAMILY_LABELS} onChange={(v) => set('scentFamily', v)} />
          <Notes id="f-top" label={t(FIELD_LABELS.notesTop!)}
            value={draft.notesTop as string[]} onChange={(v) => set('notesTop', v)} />
          <Notes id="f-heart" label={t(FIELD_LABELS.notesHeart!)}
            value={draft.notesHeart as string[]} onChange={(v) => set('notesHeart', v)} />
          <Notes id="f-base" label={t(FIELD_LABELS.notesBase!)}
            value={draft.notesBase as string[]} onChange={(v) => set('notesBase', v)} />
        </Group>

        <Group title={t("4 · Wear and performance")}>
          <Toggles label={t(FIELD_LABELS.seasons!)} values={draft.seasons as never}
            options={SEASONS} labels={SEASON_LABELS} onChange={(v) => set('seasons', v)} />
          <Toggles label={t(FIELD_LABELS.occasions!)} values={draft.occasions as never}
            options={OCCASIONS} labels={OCCASION_LABELS} onChange={(v) => set('occasions', v)} />
          <Choice id="f-daynight" label={t(FIELD_LABELS.dayNight!)}
            value={draft.dayNight as never} options={DAY_NIGHT}
            labels={DAY_NIGHT_LABELS} onChange={(v) => set('dayNight', v)} />
          <Choice id="f-projection" label={t(FIELD_LABELS.projectionBand!)}
            value={draft.projectionBand as never} options={PROJECTION_BANDS}
            labels={PROJECTION_LABELS} onChange={(v) => set('projectionBand', v)} />
          <Choice id="f-longevity" label={t(FIELD_LABELS.longevityBand!)}
            value={draft.longevityBand as never} options={LONGEVITY_BANDS}
            labels={LONGEVITY_LABELS} onChange={(v) => set('longevityBand', v)} />
          <Choice id="f-source" label={t(FIELD_LABELS.performanceSource!)}
            value={draft.performanceSource as never} options={PERFORMANCE_SOURCES}
            labels={SOURCE_LABELS} onChange={(v) => set('performanceSource', v)}
            hint={t("Required source for longevity and projection claims. Estimates cannot be published without a source.")} />
        </Group>

        <Group title={t("5 · Responsibility and product policy")}>
          <Row label={t(FIELD_LABELS.responsiblePartyName!)} htmlFor="f-responsible"
            hint={t("The party responsible for the product supplied to the customer.")}>
            <input
              id="f-responsible" value={String(draft.responsiblePartyName ?? '')} maxLength={200}
              onChange={(e) => set('responsiblePartyName', e.target.value)} className={control}
            />
          </Row>
          <Choice id="f-return" label={t(FIELD_LABELS.returnEligibility!)}
            value={draft.returnEligibility as never} options={RETURN_ELIGIBILITIES}
            labels={RETURN_LABELS} onChange={(v) => set('returnEligibility', v)} />
          <Row label={t(FIELD_LABELS.defectRoute!)} htmlFor="f-defect"
            hint={t("What happens if the product arrives defective.")}>
            <textarea
              id="f-defect" rows={3} value={String(draft.defectRoute ?? '')} maxLength={500}
              onChange={(e) => set('defectRoute', e.target.value)}
              className="min-h-touch w-full border border-line bg-ground px-3 py-3 text-body leading-relaxed text-ink transition-colors duration-base ease-out focus:border-ink focus:outline-none"
            />
          </Row>
        </Group>
      </fieldset>

      {/* ------------------------------------------------------ what is wrong */}

      {claims.length > 0 && (
        <ul
          className={`mb-6 border-s-2 ps-4 ${refused ? 'border-danger' : 'border-accent'}`}
          aria-live="polite"
        >
          {claims.map((claim, i) => (
            <li key={i} className={`py-1.5 text-small leading-relaxed ${refused ? 'text-danger' : 'text-ink2'}`}>
              {t(CLAIM_LABELS[claim.code])}
              {/* The matched words, quoted. "A prohibited claim" tells a house
                  nothing about which sentence to change. */}
              <span className="text-ink3"> — «{claim.evidence}»</span>
            </li>
          ))}
        </ul>
      )}

      {gaps.length > 0 && (
        <div className="mb-6 border-s-2 border-line ps-4">
          <p className="mb-2 text-small text-ink3">
            {t(" Missing before submission · ")}<span className="tnum">{gaps.length}</span>
          </p>
          <p className="text-small leading-relaxed text-ink2">
            {gaps.map((gap) => t(FIELD_LABELS[gap.field] ?? gap.field)).join(' · ')}
          </p>
        </div>
      )}

      {!listing.primaryImage && (
        <p className="mb-6 border-s-2 border-line ps-4 text-small leading-relaxed text-ink2">
          {t(" Add a primary photograph in the Photos section above. Publication requires one. ")}</p>
      )}

      {message && <p role="alert" className="mb-5 text-small text-danger">{errorText(message)}</p>}

      {/* ----------------------------------------------------------- actions */}

      <div className="flex flex-wrap items-center gap-3 border border-line bg-ground p-5">
        {!readOnly && (
          <PrimaryButton type="button" fill="auto" disabled={pending} onClick={save}>
            {pending ? t("Working…") : saved ? t("Saved") : t("Save changes")}
          </PrimaryButton>
        )}

        {nextListingStates(state, 'seller')
          .filter((to): to is keyof typeof MOVE_LABELS => to in MOVE_LABELS)
          .map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending || (to === 'pending_moderation' && (gaps.length > 0 || refused))}
              onClick={() => move(to)}
              className="tappable flex min-h-touch items-center border border-line px-5 text-bodyLg text-ink2 transition-colors duration-base ease-out hover:border-accent hover:text-accent disabled:opacity-disabled"
            >
              {to === 'draft' && state === 'archived' ? t("Restore to draft") : t(MOVE_LABELS[to])}
            </button>
          ))}
      </div>
    </div>
  );
}
