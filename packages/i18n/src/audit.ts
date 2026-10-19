/**
 * The audit trail, in words.
 *
 * An entry stores what changed as JSON — `{"status":"live"}` — because that is
 * what survives schema changes and what a machine can diff. Nobody should have
 * to read it that way. This turns an entry into lines an operator, an
 * accountant or a lawyer can read: which field, from what, to what.
 *
 * TWO RULES.
 *
 * Nothing is hidden. A field with no label here is shown under its own key and
 * a value with no word is shown as itself. An audit screen that drops what it
 * cannot translate is an audit screen that can be made to omit things, and a
 * test in `packages/api` fails when a router writes a field this file cannot
 * name — so the fallback is a safety net, not a habit.
 *
 * Identifiers are the exception, and only because they carry nothing a reader
 * can use: a uuid is not information to a person. The entry's subject is named
 * by its kind; the ids stay in the database for joining.
 */
import { LISTING_STATE_AR, MODERATION_REASON_AR, NOTE_ICON_AR, PAGE_STATE_AR } from './catalogue';
import { COST_BEARER_AR, RETURN_REASON_AR, RETURN_STATE_AR } from './returns';
import { internal, formatPrice, CURRENCY_LABEL } from './numerals';
import {
  SELLER_STATUS_AR, VERIFICATION_CONTROL_AR, VERIFICATION_STATUS_AR,
} from './verification';

/** Each kind of decision, named as the act a person performed. */
export const AUDIT_ACTION_AR = {
  seller_status_change: 'تغيير حالة دار',
  verification_decision: 'قرار في بند تحقّق',
  listing_moderation: 'قرار في منتج',
  review_moderation: 'إشراف على تقييم',
  commission_rate_change: 'تغيير العمولة',
  payout_approval: 'إصدار دفعة لدار',
  payout_adjustment: 'حركة مالية',
  policy_change: 'نشر صفحة أو سياسة',
  staff_permission_change: 'تغيير صلاحيات',
  privacy_request: 'طلب خصوصية',
} as const;

/** What the decision was about. */
export const AUDIT_ENTITY_AR = {
  sellers: 'دار',
  seller_verifications: 'تحقّق دار',
  products: 'منتج',
  reviews: 'تقييم',
  returns: 'إرجاع',
  sub_orders: 'شحنة',
  payouts: 'دفعة',
  content_pages: 'صفحة',
  note_glossary: 'قاموس النفحات',
  product_media_reliefs: 'العرض المجسّم',
} as const;

/** Every field a router writes into `before` / `after`. */
export const AUDIT_FIELD_AR = {
  status: 'الحالة',
  state: 'الحالة',
  reason: 'السبب',
  note: 'الملاحظة',
  hidden: 'الظهور',
  control: 'البند',
  slug: 'الرابط',
  ar: 'النفحة',
  en: 'الاسم بالإنجليزية',
  icon: 'الرسم',
  product: 'العطر',
  method: 'طريقة القصّ',
  opaque: 'زجاج معتم',
  reference: 'المرجع',
  costBearer: 'التكلفة على',
  refundPiastres: 'المبلغ المردود',
  collectedPiastres: 'المبلغ المحصّل',
  grossPiastres: 'الإجمالي',
  commissionPiastres: 'العمولة',
  netPiastres: 'الصافي للدار',
  heldGrossPiastres: 'محتجز حتى انتهاء المهلة',
  lineCount: 'عدد البنود',
  periodStart: 'بداية الفترة',
  periodEnd: 'نهاية الفترة',
} as const;

/** A value that was present and empty, as opposed to a field not mentioned. */
export const AUDIT_EMPTY_AR = 'لا شيء';

export interface AuditLine {
  readonly field: string;
  readonly label: string;
  /** Null when the entry did not record a previous value. */
  readonly from: string | null;
  readonly to: string | null;
}

type Words = Readonly<Record<string, string>>;

/** How a relief's outline was found — the console's own words for the two ways. */
export const RELIEF_METHOD_AR: Readonly<Record<string, string>> = {
  automatic: 'تلقائي',
  traced: 'برسم الحدود يدويًا',
};

/**
 * Which vocabulary a field's value belongs to.
 *
 * `status` means a listing's state on a product and a house's standing on a
 * seller; `reason` is a moderation code on one and a return reason on the
 * other. The field name alone is not enough, so the entity decides.
 */
function vocabularyFor(entityTable: string, field: string): Words | null {
  switch (field) {
    case 'status':
      if (entityTable === 'products') return LISTING_STATE_AR;
      if (entityTable === 'sellers') return SELLER_STATUS_AR;
      if (entityTable === 'seller_verifications') return VERIFICATION_STATUS_AR;
      return null;
    case 'state':
      if (entityTable === 'returns') return RETURN_STATE_AR;
      if (entityTable === 'content_pages') return PAGE_STATE_AR;
      return null;
    case 'reason':
      if (entityTable === 'products') return MODERATION_REASON_AR;
      if (entityTable === 'returns') return RETURN_REASON_AR;
      return null;
    case 'costBearer':
      return COST_BEARER_AR;
    case 'control':
      return VERIFICATION_CONTROL_AR;
    case 'icon':
      // A note's drawing (0031), named as the picker names it.
      return entityTable === 'note_glossary' ? NOTE_ICON_AR : null;
    case 'method':
      // How a relief's outline was found (0032).
      return entityTable === 'product_media_reliefs' ? RELIEF_METHOD_AR : null;
    default:
      return null;
  }
}

const isIdentifier = (field: string) => field === 'id' || field.endsWith('Id');

function formatValue(entityTable: string, field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return AUDIT_EMPTY_AR;

  if (typeof value === 'boolean') {
    if (field === 'hidden') return value ? 'مخفي' : 'ظاهر';
    return value ? 'نعم' : 'لا';
  }

  // Money is integer piastres everywhere, and read by an operator in the
  // internal register: Western digits, currency named.
  if (field.endsWith('Piastres') && typeof value === 'number') {
    return `${formatPrice(value)} ${CURRENCY_LABEL}`;
  }

  if (typeof value === 'number') return internal(value);

  if (typeof value === 'string') {
    const words = vocabularyFor(entityTable, field);
    if (words) return words[value] ?? value;
    // A period boundary is an instant; the day is what a statement is for.
    if ((field === 'periodStart' || field === 'periodEnd') && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value.slice(0, 10);
    }
    return value;
  }

  return JSON.stringify(value);
}

function parse(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  } catch {
    // Not JSON. Shown as written rather than dropped — see the header.
    return { value: text };
  }
}

/**
 * The lines of one entry: every field it mentions, from and to.
 *
 * A field recorded on both sides with the same value is left out. Writers
 * snapshot a few fields for context — a return's cost bearer, a page's slug —
 * and repeating an unchanged value as a "change" buries the one that moved.
 * A field only in `after` is still shown: that is what the decision set.
 */
export function describeAuditChange(entry: {
  readonly entityTable: string;
  readonly before: string | null;
  readonly after: string | null;
}): AuditLine[] {
  const before = parse(entry.before);
  const after = parse(entry.after);
  const fields = [...new Set([...Object.keys(after), ...Object.keys(before)])];

  const lines: AuditLine[] = [];
  for (const field of fields) {
    if (isIdentifier(field)) continue;

    const hadBefore = Object.prototype.hasOwnProperty.call(before, field);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, field);
    const from = hadBefore ? formatValue(entry.entityTable, field, before[field]) : null;
    const to = hasAfter ? formatValue(entry.entityTable, field, after[field]) : null;
    if (from !== null && to !== null && from === to) continue;

    lines.push({
      field,
      label: (AUDIT_FIELD_AR as Words)[field] ?? field,
      from,
      to,
    });
  }
  return lines;
}
