/**
 * Making Arabic searchable.
 *
 * THIS FILE IS THE DIFFERENCE BETWEEN SEARCH WORKING AND SEARCH LOOKING BROKEN,
 * and it is invisible to anybody testing in Latin.
 *
 * Arabic writes the same word several ways, and every one of them is correct:
 *
 *   ليل القاهرة   ليل القاهره      taa marbuta written as a plain haa
 *   أحمد  إحمد  آحمد  احمد          hamza on the alef, under it, or omitted
 *   عطري   عطرى                     yaa written as alef maqsura
 *   عِطْر    عطر                       with the short vowels, or without
 *   ٥٠ مل   50 مل                    Arabic-Indic or Western numerals
 *
 * Nobody types diacritics into a search box, everybody drops the hamza when
 * they are in a hurry, and phone keyboards differ on the final yaa. A search
 * that compares the raw strings finds nothing for a customer who spelled the
 * product's own name in the ordinary way — and the customer concludes the shop
 * does not stock it, not that the search is naive.
 *
 * So both sides are folded to one form: what is STORED and what is TYPED go
 * through this identical function. That is the whole design — the fold has to be
 * the same fold, which is why it lives in the domain rather than half in SQL.
 *
 * Deliberately NOT stemming. Arabic stemmers strip prefixes and suffixes by
 * rule, and on a catalogue of proper nouns — house names, note names — they do
 * more damage than good: `العود` stemmed to `عود` is right, `عودة` stemmed to
 * `عود` is a different word entirely. Folding is reversible in meaning;
 * stemming is not.
 */

/** Tashkeel and the tatweel, which carry no meaning for matching. */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Arabic-Indic (U+0660) and extended/Persian (U+06F0) digits. */
const DIGITS = /[٠-٩۰-۹]/g;

/**
 * Letters that are written more than one way and mean the same thing.
 *
 * Each maps to the plainest form. The direction matters: folding TOWARD the
 * bare letter means a customer who types the careful spelling and one who types
 * the quick one land in the same place, which is the point.
 */
const LETTERS: Readonly<Record<string, string>> = {
  // Alef, with hamza above, below, madda, or wasla.
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  // Alef maqsura, which phone keyboards and people use interchangeably with yaa.
  'ى': 'ي',
  // Taa marbuta, routinely written as a plain haa at the end of a word.
  'ة': 'ه',
  // Hamza carried on waw or yaa — dropped by most typists.
  'ؤ': 'و', 'ئ': 'ي', 'ء': '',
};

/**
 * The single fold, applied to stored text and to typed text alike.
 *
 * Lowercasing is included because a catalogue holds Latin too — house wordmarks
 * are set in Latin and a customer searching "maison" should find MAISON NOUR.
 */
export function foldArabic(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .replace(DIGITS, (d) => {
      const code = d.charCodeAt(0);
      return String(code - (code >= 0x06F0 ? 0x06F0 : 0x0660));
    })
    .replace(/[أإآٱىةؤئء]/g, (letter) => LETTERS[letter] ?? letter)
    .toLowerCase()
    // Punctuation becomes a space rather than nothing: "القاهرة/سيوة" is two
    // words a person may search for separately, and joining them into one
    // makes both unfindable.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The terms a query is looking for.
 *
 * Split on whitespace and matched with AND, because a two-word query is a
 * customer narrowing down. "عود سيوة" means both, and matching either would
 * return the whole amber section and bury what they asked for.
 *
 * Terms shorter than two characters are dropped: a single Arabic letter matches
 * most of the catalogue and costs a full scan to prove it.
 */
export function searchTerms(query: string): string[] {
  return foldArabic(query).split(' ').filter((term) => term.length >= 2);
}

/** Whether a folded haystack satisfies every term. */
export function matchesTerms(folded: string, terms: readonly string[]): boolean {
  return terms.every((term) => folded.includes(term));
}
