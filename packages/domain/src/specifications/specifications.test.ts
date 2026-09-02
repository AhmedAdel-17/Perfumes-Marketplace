import { describe, expect, it } from 'vitest';
import {
  canReview, HasNoProhibitedClaims, isPublishable,
  type ProductCandidate, type ReviewCandidate,
} from './index';

const complete = (over: Partial<ProductCandidate> = {}): ProductCandidate => ({
  concentration: 'eau_de_parfum',
  form: 'spray',
  genderPositioning: 'women',
  scentFamily: 'floral',
  notesTop: ['برغموت'],
  notesHeart: ['ورد'],
  notesBase: ['مسك'],
  seasons: ['spring'],
  occasions: ['daily'],
  dayNight: 'both',
  projectionBand: 'moderate',
  longevityBand: 'long',
  performanceSource: 'seller_provided',
  responsiblePartyName: 'دار الورد',
  returnEligibility: 'sealed_only',
  defectRoute: 'استلام من العميل',
  media: [{ isPrimary: true, ownershipConfirmed: true, altText: 'زجاجة ورد الطائف' }],
  name: 'ورد الطائف',
  description: 'عطر زهري شرقي يفتح بالبرغموت.',
  ...over,
});

const codes = (c: ProductCandidate) => isPublishable.evaluate(c).failures.map((f) => f.code);

describe('publish gate — the readable half of the database trigger', () => {
  it('passes a complete listing', () => {
    expect(isPublishable.isSatisfiedBy(complete())).toBe(true);
  });

  it('reports EVERY problem at once, not one per submission', () => {
    const bare: ProductCandidate = { media: [] };
    const failures = isPublishable.evaluate(bare).failures;
    expect(failures.length).toBeGreaterThan(14);
    expect(new Set(failures.map((f) => f.field)).size).toBeGreaterThan(10);
  });

  it('names the field so the portal can focus it', () => {
    const f = isPublishable.evaluate(complete({ scentFamily: null })).failures;
    expect(f).toHaveLength(1);
    expect(f[0]!.field).toBe('scentFamily');
    expect(f[0]!.message).toContain('العائلة العطرية');
  });

  it('treats whitespace as missing', () => {
    expect(codes(complete({ responsiblePartyName: '   ' }))).toContain('REQUIRED_FIELD_MISSING');
  });

  it('treats an empty notes array as missing', () => {
    expect(codes(complete({ notesHeart: [] }))).toContain('REQUIRED_FIELD_MISSING');
  });
});

describe('performance claims must disclose their source', () => {
  it('refuses a band with no stated source', () => {
    expect(codes(complete({ performanceSource: null }))).toContain('PERFORMANCE_SOURCE_MISSING');
  });

  it('allows a listing that claims no performance at all', () => {
    const c = complete({ projectionBand: null, longevityBand: null, performanceSource: null });
    // still fails the required-field rule, but NOT the source rule
    expect(codes(c)).not.toContain('PERFORMANCE_SOURCE_MISSING');
  });
});

describe('image ownership', () => {
  it('refuses a listing with no primary image', () => {
    expect(codes(complete({ media: [] }))).toContain('PRIMARY_IMAGE_MISSING');
  });

  it('refuses an unconfirmed image, and says so separately from alt text', () => {
    const c = complete({ media: [{ isPrimary: true, ownershipConfirmed: false, altText: '' }] });
    expect(codes(c)).toEqual(
      expect.arrayContaining(['IMAGE_OWNERSHIP_UNCONFIRMED', 'ALT_TEXT_MISSING']),
    );
  });
});

describe('prohibited claims — the highest legal-risk rule in the platform', () => {
  const claims = new HasNoProhibitedClaims();
  const rejects = (description: string, restricted: string[] = []) =>
    claims.evaluate({ name: 'عطر', description, restrictedTrademarks: restricted }).failures.map((f) => f.code);

  it('rejects a percentage similarity claim in Arabic', () => {
    expect(rejects('مطابق ٩٥٪ لعطر فرنسي')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
    expect(rejects('تشابه بنسبة 90%')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
  });

  it('rejects it in English too', () => {
    expect(rejects('95% identical to the original')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
    expect(rejects('A dupe of a designer classic')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
    expect(rejects('clone of a famous scent')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
  });

  it('rejects "نسخة طبق الأصل"', () => {
    expect(rejects('نسخة طبق الأصل')).toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
  });

  it('rejects a false authorisation claim', () => {
    expect(rejects('نحن الوكيل الرسمي')).toContain('FALSE_AUTHORISATION_CLAIM');
    expect(rejects('official distributor in Egypt')).toContain('FALSE_AUTHORISATION_CLAIM');
  });

  it('blocks a restricted trademark until counsel clears it', () => {
    // OPEN_DECISIONS.md: do not implement designer-name comparison without sign-off.
    expect(rejects('يشبه Baccarat Rouge', ['Baccarat Rouge'])).toContain('RESTRICTED_TRADEMARK');
  });

  it('the restricted list is empty by default, so nothing is banned by accident', () => {
    expect(rejects('يشبه Baccarat Rouge')).not.toContain('RESTRICTED_TRADEMARK');
  });

  it('accepts an honest description', () => {
    expect(rejects('عطر شرقي دافئ يفتح بالبرغموت ويستقرّ على العنبر والعود.')).toEqual([]);
  });

  it('does not fire on an innocent percentage', () => {
    expect(rejects('خصم 20% هذا الأسبوع')).toEqual([]);
  });

  it('blocks publication of a listing carrying a prohibited claim', () => {
    expect(codes(complete({ description: 'مطابق ٩٥٪ للأصل' })))
      .toContain('UNSUBSTANTIATED_SIMILARITY_CLAIM');
  });
});

describe('review eligibility — acceptance gate 5, readable', () => {
  const base: ReviewCandidate = {
    subOrderState: 'delivered',
    alreadyReviewed: false,
    deliveredAt: new Date('2026-08-28T00:00:00Z'),
    now: new Date('2026-09-01T00:00:00Z'),
    windowDays: 90,
  };

  it('allows a delivered, unreviewed purchase inside the window', () => {
    expect(canReview.isSatisfiedBy(base)).toBe(true);
  });

  it('refuses anything not delivered', () => {
    for (const state of ['placed', 'awaiting_seller', 'confirmed', 'dispatched', 'refused', 'returned']) {
      const r = canReview.evaluate({ ...base, subOrderState: state });
      expect(r.satisfied, state).toBe(false);
      expect(r.failures.map((f) => f.code)).toContain('NOT_DELIVERED');
    }
  });

  it('refuses a second review', () => {
    expect(canReview.evaluate({ ...base, alreadyReviewed: true }).failures.map((f) => f.code))
      .toContain('ALREADY_REVIEWED');
  });

  it('refuses once the window has closed', () => {
    const r = canReview.evaluate({ ...base, now: new Date('2027-01-01T00:00:00Z') });
    expect(r.failures.map((f) => f.code)).toContain('REVIEW_WINDOW_CLOSED');
  });

  it('collects several reasons at once', () => {
    const r = canReview.evaluate({ ...base, subOrderState: 'refused', alreadyReviewed: true });
    expect(r.failures.map((f) => f.code).sort()).toEqual(['ALREADY_REVIEWED', 'NOT_DELIVERED']);
  });
});

describe('composition', () => {
  it('and() runs both sides so nothing short-circuits a diagnostic', () => {
    const r = isPublishable.evaluate({ media: [], description: 'مطابق ٩٩٪' });
    const kinds = new Set(r.failures.map((f) => f.code));
    expect(kinds.has('REQUIRED_FIELD_MISSING')).toBe(true);
    expect(kinds.has('PRIMARY_IMAGE_MISSING')).toBe(true);
    expect(kinds.has('UNSUBSTANTIATED_SIMILARITY_CLAIM')).toBe(true);
  });

  it('a satisfied specification reports no failures', () => {
    const r = isPublishable.evaluate(complete());
    expect(r.satisfied).toBe(true);
    expect(r.failures).toEqual([]);
  });
});
