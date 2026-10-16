import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from './tokens.json' with { type: 'json' };
import { TOKENS_SOURCE, UI_SOURCE, WEB_SOURCE, stripComments, walk } from './source-files';

/**
 * A token value must exist in exactly one place.
 *
 * DESIGN_DOCTRINE.md forbids hardcoded colours, and the ban survived review
 * because it reads as obvious. It was broken three times over for a single
 * palette: `noteTier` lived in tokens.json, again in a stylesheet nothing
 * imported, and again as three inline hexes in the component that actually
 * rendered — under a header reading "nothing here is hardcoded".
 *
 * Raising a colour to clear its contrast floor therefore changed nothing on
 * screen, and the audit that caught the contrast failure caught it again after
 * the "fix". That is what drift costs: not a wrong colour, but a correction
 * that silently does not apply.
 *
 * This walks the source and fails if a token's value appears as a literal
 * anywhere outside tokens.json. It deliberately does NOT ban hex literals in
 * general — the flacon render uses neutral speculars and shadows that are not
 * tokens and should not be — because a rule that fires constantly gets
 * suppressed, and a suppressed rule protects nothing.
 */
const ROOTS = [WEB_SOURCE, UI_SOURCE, TOKENS_SOURCE];

/**
 * Every colour token, flattened to `name -> #hex`.
 *
 * The LIGHT palettes are here for the same reason the dark ones are, and the
 * risk is higher: they are newer, less familiar, and a value retyped into a
 * component would be invisible to anyone reviewing in the default theme.
 */
const tokenColours: Array<[string, string]> = [
  ...Object.entries(raw.color),
  ...Object.entries(raw.colorLight),
  ...Object.entries(raw.noteTier),
  ...Object.entries(raw.noteTierLight),
  ...Object.entries(raw.scentFamily),
  // (The `stage` palette, DR-13, was removed with identity v2's Phase D.)
].filter(([name]) => !name.startsWith('$')) as Array<[string, string]>;

describe('token drift — a value lives in one place or it lives in none', () => {
  it('has colours to check, so this test cannot pass by finding nothing', () => {
    expect(tokenColours.length).toBeGreaterThan(10);
  });

  it('never repeats a token colour as a literal in source', () => {
    const files = ROOTS.flatMap((root) => walk(root))
      .filter((file) => !file.endsWith('drift.test.ts'));
    expect(files.length, 'the walker must actually find source').toBeGreaterThan(20);

    const offences: string[] = [];

    for (const file of files) {
      // tokens.json is the source of truth; the preset and the derivations read
      // from it by reference, never by repeating a literal.
      if (file.endsWith('tokens.json')) continue;
      // Comments are stripped first. `glass.ts` names two family colours in its
      // header to explain WHY the palette is derived rather than authored, and
      // a guard that cannot tell prose from code teaches people to delete the
      // prose. The domain's architecture guard learned the same lesson.
      const text = stripComments(readFileSync(file, 'utf8'));

      for (const [name, hex] of tokenColours) {
        // Case-insensitive: #8A6838 and #8a6838 are the same drift.
        const pattern = new RegExp(hex.replace('#', '#'), 'i');
        if (pattern.test(text)) {
          offences.push(`${file.split(/[\/]/).slice(-2).join('/')} repeats ${name} (${hex})`);
        }
      }
    }

    expect(offences, offences.join('\n')).toEqual([]);
  });
});
