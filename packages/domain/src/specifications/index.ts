/**
 * Specifications.
 *
 * Pattern — Specification, composable with and/or/not
 * (ENGINEERING_PRINCIPLES §4).
 *
 * These are the readable half of rules the database also enforces. The trigger
 * in migration 0001 is what cannot be bypassed; this is what can be shown to a
 * seller with an explanation of exactly what is wrong, and reused unchanged in
 * the portal, the API and a background job.
 *
 * Keeping both is deliberate duplication, not an oversight: one place to read
 * the rule, one place it cannot be evaded.
 */

export interface Failure {
  readonly code: string;
  /** Arabic, because errors are surfaced to the user in Arabic (§7). */
  readonly message: string;
  readonly field?: string;
}

export interface Result {
  readonly satisfied: boolean;
  readonly failures: readonly Failure[];
}

export abstract class Specification<T> {
  abstract evaluate(candidate: T): Result;

  isSatisfiedBy(candidate: T): boolean {
    return this.evaluate(candidate).satisfied;
  }

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }
}

const ok: Result = { satisfied: true, failures: [] };
const fail = (...failures: Failure[]): Result => ({ satisfied: false, failures });

class AndSpecification<T> extends Specification<T> {
  constructor(private readonly a: Specification<T>, private readonly b: Specification<T>) {
    super();
  }
  evaluate(c: T): Result {
    // Both sides always run, so a seller sees every problem at once rather than
    // fixing one field per submission.
    const ra = this.a.evaluate(c);
    const rb = this.b.evaluate(c);
    const failures = [...ra.failures, ...rb.failures];
    return failures.length === 0 ? ok : { satisfied: false, failures };
  }
}

class OrSpecification<T> extends Specification<T> {
  constructor(private readonly a: Specification<T>, private readonly b: Specification<T>) {
    super();
  }
  evaluate(c: T): Result {
    const ra = this.a.evaluate(c);
    if (ra.satisfied) return ok;
    const rb = this.b.evaluate(c);
    return rb.satisfied ? ok : { satisfied: false, failures: [...ra.failures, ...rb.failures] };
  }
}

export const all = <T>(specs: readonly Specification<T>[]): Specification<T> =>
  specs.reduce((acc, s) => acc.and(s));

// ============================================================== catalogue

export interface ProductCandidate {
  readonly concentration?: string | null;
  readonly form?: string | null;
  readonly genderPositioning?: string | null;
  readonly scentFamily?: string | null;
  readonly notesTop?: readonly string[] | null;
  readonly notesHeart?: readonly string[] | null;
  readonly notesBase?: readonly string[] | null;
  readonly seasons?: readonly string[] | null;
  readonly occasions?: readonly string[] | null;
  readonly dayNight?: string | null;
  readonly projectionBand?: string | null;
  readonly longevityBand?: string | null;
  readonly performanceSource?: string | null;
  readonly responsiblePartyName?: string | null;
  readonly returnEligibility?: string | null;
  readonly defectRoute?: string | null;
  readonly media?: readonly {
    readonly isPrimary: boolean;
    readonly ownershipConfirmed: boolean;
    readonly altText?: string | null;
  }[];
  readonly name?: string | null;
  readonly description?: string | null;
}

const present = (v: unknown): boolean =>
  v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');

const nonEmpty = (v: readonly unknown[] | null | undefined): boolean =>
  Array.isArray(v) && v.length > 0;

class HasRequiredFields extends Specification<ProductCandidate> {
  evaluate(p: ProductCandidate): Result {
    const failures: Failure[] = [];
    const need = (cond: boolean, field: string, message: string) => {
      if (!cond) failures.push({ code: 'REQUIRED_FIELD_MISSING', field, message });
    };

    need(present(p.concentration), 'concentration', 'حدّد التركيز');
    need(present(p.form), 'form', 'حدّد شكل العبوة');
    need(present(p.genderPositioning), 'genderPositioning', 'حدّد الفئة');
    need(present(p.scentFamily), 'scentFamily', 'حدّد العائلة العطرية');
    need(nonEmpty(p.notesTop), 'notesTop', 'أضف نوتات القمة');
    need(nonEmpty(p.notesHeart), 'notesHeart', 'أضف نوتات القلب');
    need(nonEmpty(p.notesBase), 'notesBase', 'أضف نوتات القاعدة');
    need(nonEmpty(p.seasons), 'seasons', 'حدّد المواسم المناسبة');
    need(nonEmpty(p.occasions), 'occasions', 'حدّد المناسبات');
    need(present(p.dayNight), 'dayNight', 'حدّد وقت الاستخدام');
    need(present(p.projectionBand), 'projectionBand', 'حدّد نطاق الانتشار');
    need(present(p.longevityBand), 'longevityBand', 'حدّد نطاق الثبات');
    need(present(p.responsiblePartyName), 'responsiblePartyName', 'حدّد الجهة المسؤولة عن المنتج');
    need(present(p.returnEligibility), 'returnEligibility', 'حدّد سياسة الإرجاع');
    need(present(p.defectRoute), 'defectRoute', 'حدّد مسار التعامل مع العيوب');

    return failures.length === 0 ? ok : { satisfied: false, failures };
  }
}

/** A performance band without a disclosed source is a seller claim dressed as fact. */
class DisclosesPerformanceSource extends Specification<ProductCandidate> {
  evaluate(p: ProductCandidate): Result {
    const claimsPerformance = present(p.projectionBand) || present(p.longevityBand);
    if (claimsPerformance && !present(p.performanceSource)) {
      return fail({
        code: 'PERFORMANCE_SOURCE_MISSING',
        field: 'performanceSource',
        message: 'حدّد مصدر بيانات الأداء: بيانات الدار، أو اختبار المنصّة، أو متوسّط التقييمات',
      });
    }
    return ok;
  }
}

class HasOwnedPrimaryImage extends Specification<ProductCandidate> {
  evaluate(p: ProductCandidate): Result {
    const primary = (p.media ?? []).find((m) => m.isPrimary);
    if (!primary) {
      return fail({ code: 'PRIMARY_IMAGE_MISSING', field: 'media', message: 'أضف صورة رئيسية' });
    }
    const failures: Failure[] = [];
    if (!primary.ownershipConfirmed) {
      failures.push({
        code: 'IMAGE_OWNERSHIP_UNCONFIRMED',
        field: 'media',
        message: 'أقرّ بملكيّة الصورة قبل النشر',
      });
    }
    if (!present(primary.altText)) {
      failures.push({
        code: 'ALT_TEXT_MISSING',
        field: 'media',
        message: 'أضف وصفًا نصّيًا للصورة',
      });
    }
    return failures.length === 0 ? ok : { satisfied: false, failures };
  }
}

/**
 * Prohibited claims.
 *
 * Doc 06 §4 and CLAUDE.md §4. OPEN_DECISIONS.md calls designer-name comparison
 * "the single most likely place to create real legal liability from a coding
 * decision", so it is blocked here until Egyptian counsel signs it off — the
 * seller is told the rule rather than asked to judge it.
 */
/**
 * Similarity words and percentages, matched in EITHER order, with wording
 * permitted between them.
 *
 * Two bugs were caught here by test, on the rule carrying the most legal
 * exposure in the platform:
 *
 *  - the first version required the number to follow the word immediately, so
 *    "تشابه بنسبة 90%" passed — the exact phrasing a seller would reach for.
 *    "تشابه" was also missing from the word list entirely.
 *  - \b creates no word boundary before an Arabic letter in JavaScript, because
 *    \w is ASCII-only. So "نسخة طبق الأصل" never matched at all.
 *
 * Parts are declared as regex LITERALS and composed through .source, so there
 * is no hand-escaping left to get wrong.
 */
const SIMILARITY_WORD = /(?:مطابق(?:ة)?|مشابه(?:ة)?|تشابه|تطابق|شبيه|يشبه|نسخة|تقليد)/;
const PERCENTAGE = /[\d\u0660-\u0669]{1,3}\s*[%\u066A]/;
/** Bounded gap: same clause only, so unrelated text cannot bridge the two. */
const GAP = /[^.\u060C\u061B\n]{0,24}?/;

const seq = (...parts: readonly RegExp[]): RegExp =>
  new RegExp(parts.map((p) => p.source).join(''));

const SIMILARITY_PATTERNS: readonly RegExp[] = [
  // English: "95% identical", "a dupe of", "clone of"
  /\d{1,3}\s*%\s*(identical|similar|same|match)/i,
  /\b(dupe|clone)\s+of\b/i,
  /\bdupe\b/i,
  // Arabic, word then percentage: "مطابق ٩٥٪", "تشابه بنسبة 90%"
  seq(SIMILARITY_WORD, GAP, PERCENTAGE),
  // Arabic, percentage then word: "٩٥٪ تطابق"
  seq(PERCENTAGE, GAP, SIMILARITY_WORD),
  // Arabic, no percentage needed: "نسخة طبق الأصل", "تقليد الأصل"
  /(?:نسخة|تقليد)\s*(?:طبق\s*)?الأصل/,
];

const AUTHORISATION_PATTERNS: readonly RegExp[] = [
  /\b(official|authoris?ed|authorized)\s+(distributor|dealer|reseller|agent)\b/i,
  /(الوكيل|الموزّع|الموزع)\s*(الرسمي|المعتمد)/,
];

export interface ClaimsCandidate {
  // `| undefined` is explicit because exactOptionalPropertyTypes distinguishes
  // "absent" from "present and undefined", and callers forward optional fields.
  readonly name?: string | null | undefined;
  readonly description?: string | null | undefined;
  /** Trademarks awaiting legal sign-off. Empty until counsel clears the policy. */
  readonly restrictedTrademarks?: readonly string[];
}

export class HasNoProhibitedClaims extends Specification<ClaimsCandidate> {
  evaluate(c: ClaimsCandidate): Result {
    const text = `${c.name ?? ''} ${c.description ?? ''}`;
    const failures: Failure[] = [];

    if (SIMILARITY_PATTERNS.some((re) => re.test(text))) {
      failures.push({
        code: 'UNSUBSTANTIATED_SIMILARITY_CLAIM',
        field: 'description',
        message: 'نِسَب التشابه غير مسموحة — احذف عبارات مثل «مطابق ٩٥٪»',
      });
    }

    if (AUTHORISATION_PATTERNS.some((re) => re.test(text))) {
      failures.push({
        code: 'FALSE_AUTHORISATION_CLAIM',
        field: 'description',
        message: 'ادّعاء الوكالة الرسمية يتطلّب مستندًا موثّقًا',
      });
    }

    for (const mark of c.restrictedTrademarks ?? []) {
      if (new RegExp(`\\b${mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
        failures.push({
          code: 'RESTRICTED_TRADEMARK',
          field: 'description',
          message: `استخدام اسم «${mark}» موقوف حتى صدور رأي قانوني`,
        });
      }
    }

    return failures.length === 0 ? ok : { satisfied: false, failures };
  }
}

class ProductClaimsAreClean extends Specification<ProductCandidate> {
  private readonly inner = new HasNoProhibitedClaims();
  evaluate(p: ProductCandidate): Result {
    return this.inner.evaluate({ name: p.name, description: p.description });
  }
}

/** The publish gate, composed. Mirrors enforce_publish_gate() in 0001. */
export const isPublishable: Specification<ProductCandidate> = all([
  new HasRequiredFields(),
  new DisclosesPerformanceSource(),
  new HasOwnedPrimaryImage(),
  new ProductClaimsAreClean(),
]);

// ================================================================== reviews

export interface ReviewCandidate {
  readonly subOrderState: string;
  readonly alreadyReviewed: boolean;
  readonly deliveredAt?: Date;
  readonly now: Date;
  readonly windowDays: number;
}

class SubOrderDelivered extends Specification<ReviewCandidate> {
  evaluate(c: ReviewCandidate): Result {
    return c.subOrderState === 'delivered'
      ? ok
      : fail({
          code: 'NOT_DELIVERED',
          message: 'يمكن التقييم بعد استلام الطلب فقط',
        });
  }
}

class NotAlreadyReviewed extends Specification<ReviewCandidate> {
  evaluate(c: ReviewCandidate): Result {
    return c.alreadyReviewed
      ? fail({ code: 'ALREADY_REVIEWED', message: 'سبق أن قيّمت هذا المنتج' })
      : ok;
  }
}

class WithinReviewWindow extends Specification<ReviewCandidate> {
  evaluate(c: ReviewCandidate): Result {
    if (!c.deliveredAt) return ok;
    const days = (c.now.getTime() - c.deliveredAt.getTime()) / 86_400_000;
    return days <= c.windowDays
      ? ok
      : fail({ code: 'REVIEW_WINDOW_CLOSED', message: 'انتهت مهلة التقييم' });
  }
}

/** Acceptance gate 5, readable. The database trigger is what enforces it. */
export const canReview: Specification<ReviewCandidate> = all([
  new SubOrderDelivered(),
  new NotAlreadyReviewed(),
  new WithinReviewWindow(),
]);
