/**
 * Prohibited claims in a listing.
 *
 * Doc 04 §4: "The platform should prohibit confusing logos, bottle copying and
 * unsupported '90-99% identical' claims." Doc 06 §4: "No fake designer logos,
 * confusing packaging, false authorization or unsubstantiated
 * percentage-similarity claims. Original brand references in search/comparison
 * require an approved legal policy."
 *
 * THIS IS THE BUSINESS RISK, NOT A CONTENT-QUALITY FEATURE. An Egyptian
 * marketplace selling local perfume is one listing away from a trademark
 * complaint that reaches the platform rather than the house that wrote it, and
 * "95% identical to Sauvage" is the sentence that does it. A moderator reading
 * every listing will miss it on a busy day; a rule will not.
 *
 * TWO SEVERITIES, AND THE DIFFERENCE MATTERS.
 *
 *   REFUSED — the claim is prohibited outright, so the listing cannot even be
 *   submitted. A percentage-similarity claim and a replica claim are in this
 *   class because no evidence makes them acceptable.
 *
 *   FLAGGED — the claim is permitted only under a policy that does not exist
 *   yet. Naming another house is the case: comparison labels need Egyptian
 *   legal review (doc 04 §4), so the listing goes to a human rather than being
 *   refused by a regex that cannot read context.
 *
 * A detector that refused everything it noticed would teach sellers to
 * paraphrase around it, which is worse than flagging: the claim survives and
 * the evidence of it does not.
 */

export const CLAIM_FINDINGS = [
  'similarity_percentage',
  'replica_claim',
  'authorisation_claim',
  'designer_reference',
] as const;

export type ClaimCode = (typeof CLAIM_FINDINGS)[number];

export interface ClaimFinding {
  readonly code: ClaimCode;
  /** The text that matched, so a moderator sees WHY rather than being told. */
  readonly evidence: string;
  /** `refused` cannot be submitted; `flagged` goes to a person. */
  readonly severity: 'refused' | 'flagged';
}

/**
 * Houses whose names carry trademark exposure when used as a comparison.
 *
 * Deliberately short and deliberately editable. It is not an attempt to list
 * every fragrance house in the world — that list does not converge — it is the
 * set that actually appears in "smells like ..." copy in this market, and it
 * exists so the common case is caught rather than the complete one.
 *
 * Both scripts, because a listing written in Arabic will spell them in Arabic.
 */
const DESIGNER_HOUSES: readonly string[] = [
  'dior', 'chanel', 'tom ford', 'creed', 'versace', 'armani', 'gucci', 'prada',
  'hermes', 'hermès', 'ysl', 'yves saint laurent', 'lattafa', 'montale', 'amouage',
  'jo malone', 'byredo', 'le labo', 'maison margiela', 'xerjoff', 'bvlgari',
  'ديور', 'شانيل', 'توم فورد', 'كريد', 'فيرزاتشي', 'فرزاتشي', 'أرماني', 'ارماني',
  'غوتشي', 'جوتشي', 'برادا', 'هيرميس', 'إيف سان لوران', 'ايف سان لوران',
  'لطافة', 'مونتال', 'أمواج', 'جو مالون', 'بيريدو', 'زيرجوف',
];

/** Words that turn a mention into a comparison rather than a coincidence. */
const SIMILARITY_WORDS: readonly string[] = [
  'مطابق', 'مماثل', 'يشبه', 'شبيه', 'نسخة', 'طبق الأصل', 'زي', 'مثل', 'تقليد',
  'identical', 'similar', 'clone', 'dupe', 'inspired by', 'smells like', 'like',
];

/**
 * Arabic-Indic and extended digits, as Western.
 *
 * A third copy of this conversion — see the note in `order-reference.ts`. The
 * domain has no runtime dependencies, and a percentage written `٩٥٪` has to be
 * read as ninety-five here or the rule is trivially evaded by switching
 * keyboards.
 */
const westernise = (input: string): string =>
  input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= 0x06F0 ? 0x06F0 : 0x0660));
  });

/** Lowercased, digits westernised, whitespace collapsed. */
const normalise = (input: string): string =>
  westernise(input).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A percentage claim near a similarity word, or a bare high percentage.
 *
 * `٪` is the Arabic percent sign and `%` the Latin one; both appear, sometimes
 * in the same listing. The number is required to be 50 or more, because "5%
 * concentration" is a legitimate thing to write about a perfume and refusing it
 * would make the rule the seller's enemy rather than the platform's protection.
 */
const PERCENTAGE = /(\d{2,3})\s*[%٪]/g;

function percentageClaims(normalised: string): ClaimFinding[] {
  const findings: ClaimFinding[] = [];

  for (const match of normalised.matchAll(PERCENTAGE)) {
    const value = Number(match[1]);
    if (value < 50 || value > 100) continue;

    // Look at the words around it. A percentage on its own is a fact about a
    // formulation; a percentage beside "identical" is a claim about somebody
    // else's product.
    const from = Math.max(0, match.index - 40);
    // `nearby`, not `window`: this package must not so much as name a DOM
    // global, and a reader scanning for framework leakage should not have to
    // stop and work out that this one is a local.
    const nearby = normalised.slice(from, match.index + match[0].length + 40);

    /*
     * Whole words on BOTH lists.
     *
     * `مثل` and `like` are two of the commonest words in their languages and
     * appear inside longer ones constantly. A substring match here would refuse
     * — not flag, refuse — a legitimate listing that happened to mention a
     * concentration and contain a common word, and a rule that blocks honest
     * sellers is a rule they route around.
     */
    if (SIMILARITY_WORDS.some((word) => containsWord(nearby, word))
      || DESIGNER_HOUSES.some((house) => containsWord(nearby, house))) {
      findings.push({
        code: 'similarity_percentage',
        evidence: nearby.trim(),
        severity: 'refused',
      });
    }
  }

  return findings;
}

const REPLICA_PHRASES: readonly string[] = [
  'طبق الأصل', 'نسخة طبق', 'تقليد درجة أولى', 'نفس العطر الأصلي',
  'exact replica', 'first copy', 'grade a copy', '1:1',
];

const AUTHORISATION_PHRASES: readonly string[] = [
  'وكيل معتمد', 'موزّع معتمد', 'موزع معتمد', 'ترخيص من',
  'authorised dealer', 'authorized dealer', 'official distributor', 'licensed by',
];

/**
 * Inspect a listing's free text.
 *
 * Everything a seller wrote goes in — name, description, notes — because a
 * claim moved into the notes field is the same claim.
 */
export function inspectClaims(...texts: readonly string[]): ClaimFinding[] {
  const joined = texts.filter(Boolean).join(' \n ');
  const normalised = normalise(joined);
  if (!normalised) return [];

  const findings: ClaimFinding[] = [...percentageClaims(normalised)];

  for (const phrase of REPLICA_PHRASES) {
    if (normalised.includes(phrase)) {
      findings.push({ code: 'replica_claim', evidence: phrase, severity: 'refused' });
    }
  }

  for (const phrase of AUTHORISATION_PHRASES) {
    if (normalised.includes(phrase)) {
      // Not refused: a house genuinely CAN be an authorised distributor, and a
      // rule that called every one of them a liar would be wrong more often
      // than right. It goes to a person, who can ask for the paperwork.
      findings.push({ code: 'authorisation_claim', evidence: phrase, severity: 'flagged' });
    }
  }

  for (const house of DESIGNER_HOUSES) {
    if (!containsWord(normalised, house)) continue;
    findings.push({ code: 'designer_reference', evidence: house, severity: 'flagged' });
  }

  return dedupe(findings);
}

/**
 * Whole-word containment, so a house name inside a longer word does not match.
 *
 * Without it `like` matches inside nothing useful but `زي` — two very common
 * Arabic letters — matches inside dozens of ordinary words, and the rule
 * becomes noise a moderator learns to ignore. A boundary in Arabic is
 * whitespace or punctuation, not `\b`, which is defined over Latin word
 * characters and does not fire between an Arabic letter and a space.
 */
function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;

    const before = at === 0 ? ' ' : haystack[at - 1]!;
    const afterIndex = at + needle.length;
    const after = afterIndex >= haystack.length ? ' ' : haystack[afterIndex]!;

    if (isBoundary(before) && isBoundary(after)) return true;
    from = at + 1;
  }
}

const isBoundary = (character: string): boolean => !/[\p{L}\p{N}]/u.test(character);

function dedupe(findings: readonly ClaimFinding[]): ClaimFinding[] {
  const seen = new Set<string>();
  const out: ClaimFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.code}:${finding.evidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

/** Whether these findings stop a listing being submitted at all. */
export const isRefused = (findings: readonly ClaimFinding[]): boolean =>
  findings.some((f) => f.severity === 'refused');

/** Whether a human has to look before it can go live. */
export const needsReview = (findings: readonly ClaimFinding[]): boolean =>
  findings.some((f) => f.severity === 'flagged');
