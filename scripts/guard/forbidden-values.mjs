/**
 * The CI guard for values the design doctrine forbids: a hardcoded colour
 * outside the tokens, and a physical-direction utility in an RTL product.
 *
 * WHY THIS REPLACED TWO GREP LINES (task P0.1.5, decision DR-13). The guard
 * lived as shell in `.github/workflows/ci.yml` and had never passed — CI never
 * ran until 20 September 2026, and on its first run it failed. Reading why
 * showed it was wrong in both directions at once:
 *
 *   · TOO LOUD. It matched inside comments. Five of its hits were prose: a
 *     comment quoting a hex to explain why it is NOT a token, a sentence saying
 *     "left-to-right", another saying "right-aligned". A guard that fails on
 *     its own documentation teaches people to delete explanations.
 *   · TOO QUIET. It matched `#RRGGBB\b`, and `\b` needs a non-word character
 *     after the colour. Tailwind's arbitrary values separate with `_`, which is
 *     a word character — so `#2C221A_0%` never matched. Nine real hardcoded
 *     colours in four components walked straight past it; it only ever saw the
 *     two that happened to be followed by a comma or a bracket.
 *
 * So it strips comments with a small lexer that knows what a string is (a
 * regex would eat code after `image/*` or `https://`), matches a colour that is
 * simply not followed by another hex digit, and states its one exemption here,
 * with the reason, where a reviewer will see it.
 *
 * NO DEPENDENCIES, deliberately. The CI job that runs this checks out the
 * repository and nothing else — no install — so it is plain Node with builtins,
 * and it runs in about a second.
 *
 * Run locally: `node scripts/guard/forbidden-values.mjs`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.data', 'dist', '.turbo']);

/**
 * Files whose colours are ARTWORK rather than theme, and why (DR-13).
 *
 * Exempt from the colour check only — never from the direction check. Each
 * entry is a single file with its reason; an entry whose file no longer exists
 * fails the guard, because a stale exemption is a hole that opens the day
 * somebody recreates the path with a different job.
 */
const ARTWORK = [
  {
    path: 'apps/web/src/features/product/Flacon.tsx',
    because: 'A photoreal glass render. Its specular strip, brushed-metal cap bands, rim light '
      + 'and caustic are values of LIGHT ON AN OBJECT, not of the interface, and making them '
      + 'tokens would put two dozen colours in the theme that nothing else can ever use. The '
      + 'bottle’s own colour still comes from the scent-family token through glassPalette. '
      + 'Decided by the founder as DR-13 on 21 September 2026.',
  },
];

/** The design tokens themselves, and tests, which state colours on purpose. */
const excluded = (rel) =>
  rel.startsWith(`packages${sep}tokens${sep}`) || /\.test\.tsx?$/.test(rel);

/* ------------------------------------------------------------------ lexer */

/**
 * Remove comments, keep everything else — strings included — character for
 * character, with newlines preserved so line numbers still point at the source.
 *
 * Strings are KEPT because that is where the violations live: a Tailwind class
 * is a string. What must not happen is a string being mistaken for a comment
 * (`'image/*'`, `'https://…'`) and swallowing the code after it, which would
 * hide a violation rather than report a false one.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') { out += source[i] + (source[i + 1] ?? ''); i += 2; continue; }
        // A newline ends an unterminated ' or " string (a syntax error, or a
        // JSX text run with an apostrophe). Stop there rather than eat the file.
        if (source[i] === '\n' && quote !== '`') break;
        out += source[i];
        i += 1;
      }
      if (source[i] === quote) { out += quote; i += 1; }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/* ---------------------------------------------------------------- matchers */

/** A 6- or 8-digit hex colour NOT followed by another hex digit. No `\b`. */
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g;

/**
 * A colour written as a FUNCTION with a literal first argument: `rgb(6,5,5)`,
 * `rgba(206, 168, 100, .18)`, `hsl(30 20% 10%)`. DEBT_REGISTER #24 — the guard
 * used to know hex only, and seven of these sat in the stage files unseen.
 *
 * A DIGIT must follow the parenthesis. `rgb(var(--c-ground) / .72)` and
 * `rgb(${channels})` are how a TOKEN is used with an alpha, and must pass.
 */
const FUNC = /\b(?:rgba?|hsla?)\(\s*[0-9.]/g;

/** Physical directions. RTL needs logical properties: ms-, me-, ps-, pe-, start-, end-. */
const PHYSICAL = /\b(?:ml-|mr-|pl-|pr-|left-|right-|text-left|text-right)[0-9a-z]/g;

/* ------------------------------------------------------ the instrument check */

/**
 * The lexer and the matchers are checked against known inputs BEFORE they are
 * trusted with the repository. If any of these is wrong the guard exits 2 —
 * "the guard is broken" — rather than 0, because a broken guard that passes is
 * indistinguishable from a clean repository.
 */
function selfTest() {
  const cases = [
    ['// #2C221A in a comment', 0, HEX],
    ['/* #2C221A\n spans lines */ x', 0, HEX],
    ["'bg-[#2C221A_0%]'", 1, HEX],            // the blind spot that hid nine colours
    ["'#2C221A,'", 1, HEX],
    ["'#2C221AFF'", 1, HEX],                   // 8-digit counts once, as itself
    ["'image/*' + '#2C221A'", 1, HEX],         // a string with /* must not open a comment
    ["'https://x' + '#2C221A'", 1, HEX],       // nor one with //
    ["'rgba(206,168,100,.18)'", 1, FUNC],      // the seven #24 was about
    ["'rgb( 6 5 5 )'", 1, FUNC],
    ["'hsl(30 20% 10%)'", 1, FUNC],
    ["'rgb(var(--c-ground) / .72)'", 0, FUNC],  // a token with an alpha
    ['`rgb(${channels})`', 0, FUNC],
    ['// rgba(6,5,5,.6) in a comment', 0, FUNC],
    ['{/* left-to-right */}', 0, PHYSICAL],
    ["'ml-4'", 1, PHYSICAL],
    ["'ms-4'", 0, PHYSICAL],
  ];
  for (const [input, expected, matcher] of cases) {
    const found = (stripComments(input).match(matcher) ?? []).length;
    if (found !== expected) {
      console.error(`GUARD SELF-TEST FAILED on ${JSON.stringify(input)}: `
        + `expected ${expected} match(es), got ${found}. The guard cannot be trusted.`);
      process.exit(2);
    }
  }
}

/* -------------------------------------------------------------------- walk */

function files(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

export function run() {
  selfTest();

  const stale = ARTWORK.filter((a) => {
    try { statSync(join(ROOT, a.path)); return false; } catch { return true; }
  });

  const colours = [];
  const directions = [];
  let scanned = 0;

  for (const root of ROOTS) {
    for (const file of files(root)) {
      const rel = relative(ROOT, file);
      if (excluded(rel)) continue;
      scanned += 1;
      const code = stripComments(readFileSync(file, 'utf8'));
      const posix = rel.split(sep).join('/');

      if (!ARTWORK.some((a) => a.path === posix)) {
        for (const m of code.matchAll(HEX)) colours.push(`${posix}:${lineOf(code, m.index)}  ${m[0]}`);
        for (const m of code.matchAll(FUNC)) colours.push(`${posix}:${lineOf(code, m.index)}  ${m[0]}…`);
      }
      for (const m of code.matchAll(PHYSICAL)) directions.push(`${posix}:${lineOf(code, m.index)}  ${m[0]}`);
    }
  }

  // An empty walk would pass everything. Refuse to call that a clean result.
  if (scanned < 100) {
    console.error(`Scanned only ${scanned} files — the walk is broken, not the repository clean.`);
    process.exit(2);
  }

  let failed = false;
  if (stale.length > 0) {
    failed = true;
    console.error('Artwork exemptions name files that no longer exist:');
    for (const s of stale) console.error(`  ${s.path}`);
  }
  if (colours.length > 0) {
    failed = true;
    console.error('Hardcoded colours outside packages/tokens (DESIGN_DOCTRINE, CLAUDE.md §14):');
    for (const c of colours) console.error(`  ${c}`);
  } else {
    console.log(`No hardcoded colours. (${scanned} files; ${ARTWORK.length} artwork exemption.)`);
  }
  if (directions.length > 0) {
    failed = true;
    console.error('Physical direction utilities — use ms-, me-, ps-, pe-, start-, end-:');
    for (const d of directions) console.error(`  ${d}`);
  } else {
    console.log('Logical properties only.');
  }
  process.exit(failed ? 1 : 0);
}

run();
