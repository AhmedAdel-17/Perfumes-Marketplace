import { describe, expect, it } from 'vitest';
import { foldArabic, matchesTerms, searchTerms } from './arabic-search';

/**
 * The rule every case here is checking: the SAME fold is applied to what is
 * stored and to what is typed, so two correct spellings of one word have to
 * land on the same string.
 */
const same = (a: string, b: string) => expect(foldArabic(a)).toBe(foldArabic(b));

describe('spellings that must not divide a customer from a product', () => {
  it('folds taa marbuta to haa', () => {
    // The single commonest one. Nobody types the two dots in a hurry.
    same('ليل القاهرة', 'ليل القاهره');
  });

  it('folds every hamza-carrying alef to a bare alef', () => {
    same('أحمد', 'احمد');
    same('إحمد', 'احمد');
    same('آحمد', 'احمد');
    same('ٱحمد', 'احمد');
  });

  it('folds alef maqsura to yaa', () => {
    // Phone keyboards disagree about the final letter of a word like عطري.
    same('عطرى', 'عطري');
  });

  it('folds hamza on waw and yaa', () => {
    same('مؤمن', 'مومن');
    same('رئيس', 'رييس');
  });

  it('strips the short vowels', () => {
    same('عِطْر', 'عطر');
    same('مِسْك', 'مسك');
  });

  it('strips the tatweel used to stretch a word', () => {
    same('عــــود', 'عود');
  });

  it('reads Arabic-Indic and Western digits as the same number', () => {
    same('٥٠ مل', '50 مل');
    same('۵۰ مل', '50 مل');
  });

  it('folds Latin case, because house wordmarks are Latin', () => {
    same('MAISON NOUR', 'maison nour');
  });

  it('collapses punctuation to a space rather than removing it', () => {
    // "القاهرة/سيوة" is two words somebody may search for separately, and
    // joining them into one makes both unfindable.
    expect(foldArabic('القاهرة/سيوة')).toBe('القاهره سيوه');
    expect(foldArabic('عود ‒ مسك')).toBe('عود مسك');
  });

  it('collapses runs of whitespace', () => {
    expect(foldArabic('  عود    مسك  ')).toBe('عود مسك');
  });
});

describe('what the fold must NOT do', () => {
  it('does not stem', () => {
    /*
     * `عودة` (a return) and `عود` (oud) differ by one letter and mean nothing
     * alike. A stemmer strips the taa marbuta by rule and makes them the same
     * word; folding turns it into a haa and keeps them apart.
     */
    expect(foldArabic('عودة')).not.toBe(foldArabic('عود'));
  });

  it('does not merge two different letters that merely look similar', () => {
    expect(foldArabic('حمد')).not.toBe(foldArabic('جمد'));
    expect(foldArabic('سيوة')).not.toBe(foldArabic('شيوة'));
  });

  it('leaves an already-plain word untouched', () => {
    expect(foldArabic('عود')).toBe('عود');
  });

  it('survives an empty string', () => {
    expect(foldArabic('')).toBe('');
    expect(foldArabic('   ')).toBe('');
  });
});

describe('terms', () => {
  it('splits a query into words', () => {
    expect(searchTerms('عود سيوة')).toEqual(['عود', 'سيوه']);
  });

  it('drops single characters', () => {
    // One Arabic letter matches most of the catalogue and costs a full scan to
    // prove it.
    expect(searchTerms('ع عود')).toEqual(['عود']);
  });

  it('is empty for a query with nothing in it', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('؟!')).toEqual([]);
  });

  it('matches on ALL terms, not any', () => {
    /*
     * Two words is a customer narrowing down. Matching either would return the
     * whole amber section and bury the thing they actually asked for.
     */
    const haystack = foldArabic('ليل القاهرة — ميزون نور — عنبر');
    expect(matchesTerms(haystack, searchTerms('ليل القاهرة'))).toBe(true);
    expect(matchesTerms(haystack, searchTerms('ليل نور'))).toBe(true);
    expect(matchesTerms(haystack, searchTerms('ليل سيوة'))).toBe(false);
  });

  it('finds a product typed the ordinary way', () => {
    // The end-to-end point of the whole file: the careful spelling is stored,
    // the quick spelling is typed, and they meet.
    const stored = foldArabic('ليل القاهرة');
    expect(matchesTerms(stored, searchTerms('ليل القاهره'))).toBe(true);
    expect(matchesTerms(stored, searchTerms('ليل القاهرة'))).toBe(true);
  });

  it('matches a house wordmark typed in lower case', () => {
    const stored = foldArabic('ليل القاهرة MAISON NOUR');
    expect(matchesTerms(stored, searchTerms('maison'))).toBe(true);
  });

  it('an empty term list matches everything, which is the unfiltered case', () => {
    expect(matchesTerms(foldArabic('أي شيء'), [])).toBe(true);
  });
});
