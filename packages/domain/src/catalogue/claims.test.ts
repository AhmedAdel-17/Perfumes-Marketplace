import { describe, expect, it } from 'vitest';
import { inspectClaims, isRefused, needsReview, type ClaimCode } from './claims';

const codes = (...texts: string[]): ClaimCode[] =>
  inspectClaims(...texts).map((f) => f.code);

describe('percentage-similarity claims', () => {
  it.each([
    '٩٥٪ مطابق للأصلي',
    '95% مطابق للأصلي',
    'مطابق ٩٠ ٪ للعطر الأصلي',
    '98% identical to the original',
    'رائحة تشبه ديور بنسبة ٩٢٪',
  ])('refuses %s', (text) => {
    const findings = inspectClaims(text);
    expect(findings.map((f) => f.code)).toContain('similarity_percentage');
    expect(isRefused(findings), text).toBe(true);
  });

  /**
   * The false positives decide whether this rule is usable.
   *
   * A rule that blocks honest listings is a rule sellers learn to write around,
   * and then the claim survives and the evidence of it does not. Each of these
   * is a sentence a real house would write.
   */
  it.each([
    ['تركيز ٢٠٪ من الزيوت العطرية', 'a concentration, which is a fact about the formulation'],
    ['خصم ٣٠٪ هذا الأسبوع', 'a discount'],
    ['يدوم ٨ ساعات', 'a duration with no percentage at all'],
    ['عطر شرقي بنسبة عود ٦٠٪ وورد ٤٠٪', 'a composition breakdown'],
    ['نسبة التركيز ٧٠٪ إيو دو بارفان', 'a concentration in the high range'],
  ])('leaves %s alone (%s)', (text) => {
    expect(inspectClaims(text)).toEqual([]);
  });

  it('ignores a percentage below the range where a claim lives', () => {
    expect(inspectClaims('تركيز ٥٪ مطابق للمعيار')).toEqual([]);
  });

  it('reads Arabic-Indic digits, so switching keyboards does not evade it', () => {
    // The whole rule is one keystroke from useless if it only reads 9 and 5.
    expect(codes('٩٥٪ مطابق')).toContain('similarity_percentage');
    expect(codes('۹۵٪ مطابق')).toContain('similarity_percentage');
  });
});

describe('replica claims', () => {
  it.each([
    'نسخة طبق الأصل',
    'exact replica of the original',
    'first copy — grade a copy',
    'جودة 1:1',
  ])('refuses %s', (text) => {
    expect(isRefused(inspectClaims(text)), text).toBe(true);
  });
});

describe('naming another house', () => {
  it('flags rather than refuses, because comparison needs legal review', () => {
    // Doc 04 §4: original trademark references require Egyptian legal review.
    // A regex cannot tell a comparison from a coincidence, so it goes to a
    // person instead of being decided by a pattern.
    const findings = inspectClaims('عطر بإلهام من ديور');
    expect(findings.map((f) => f.code)).toContain('designer_reference');
    expect(isRefused(findings)).toBe(false);
    expect(needsReview(findings)).toBe(true);
  });

  it('finds the name in either script', () => {
    expect(codes('inspired by Dior')).toContain('designer_reference');
    expect(codes('مستوحى من شانيل')).toContain('designer_reference');
  });

  it('does not match a house name inside a longer word', () => {
    // `\b` is defined over Latin word characters and does not fire between an
    // Arabic letter and a space, so the boundary check had to be written by
    // hand. This is the case that proves it works.
    expect(inspectClaims('الورد الطائفي وأمواج البحر')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ evidence: 'أمواج' })]),
    );
  });

  it('names what it matched, so a moderator sees the evidence', () => {
    const [finding] = inspectClaims('يشبه Tom Ford');
    expect(finding?.evidence).toBe('tom ford');
  });
});

describe('authorisation claims', () => {
  it('flags rather than refuses, because a house genuinely might be one', () => {
    const findings = inspectClaims('نحن وكيل معتمد في مصر');
    expect(findings.map((f) => f.code)).toContain('authorisation_claim');
    expect(isRefused(findings)).toBe(false);
  });
});

describe('what it reads', () => {
  it('reads every field, because a claim moved is the same claim', () => {
    expect(codes('عطر الليل', 'وصف عادي', '٩٥٪ مطابق للأصلي'))
      .toContain('similarity_percentage');
  });

  it('says nothing about an ordinary listing', () => {
    expect(inspectClaims(
      'ليل القاهرة',
      'عطر شرقي بقاعدة عود وورد طائفي، يدوم من ٦ إلى ٨ ساعات.',
      'القمة: برغموت. القلب: ورد. القاعدة: عود وعنبر.',
    )).toEqual([]);
  });

  it('is quiet on empty input rather than guessing', () => {
    expect(inspectClaims()).toEqual([]);
    expect(inspectClaims('', '  ')).toEqual([]);
  });

  it('reports each distinct finding once', () => {
    // The same house named three times is one problem, not three.
    const findings = inspectClaims('ديور و ديور و ديور');
    expect(findings.filter((f) => f.code === 'designer_reference')).toHaveLength(1);
  });
});
