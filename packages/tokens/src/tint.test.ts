import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_SOURCE, WEB_SOURCE, stripComments, walk } from './source-files';

/**
 * Text is only ever set on a ground its ink was proven against.
 *
 * `tokens.test.ts` proves every ink clears 4.5:1 on every surface, in both
 * themes. That proof covers what the palette CONTAINS, and nothing about what a
 * component does with it — and twice a component quietly stepped outside it:
 *
 *  - `text-accent/90`, then `text-ink/90`: an opacity on an ink. Every
 *    calibrated ink sits just above its floor, so the alpha spends a margin that
 *    was never there. DESIGN_DOCTRINE §7: never apply an alpha to an ink role.
 *  - `bg-accent/15 text-accent`, copied into seven status pills: a translucent
 *    fill is a ground no test has seen. 4.08:1 on paper, and fine on noir, which
 *    is why it lasted until the light theme was audited.
 *
 * The audit finds these on the screens it visits in the states it reaches. This
 * finds them in the source, on every screen, before anything renders.
 *
 * WHAT IT CHECKS is one class string at a time — a quoted literal. Tailwind
 * classes that style one element are written in one string here, including the
 * branches of a conditional, so that is where a tint and its ink meet. `text-ink`
 * under a tint is allowed: the primary ink has several times the floor, and the
 * seller queue's quantity chip uses exactly that on purpose.
 */
const LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;

/** A background with an opacity: `bg-accent/15`, `bg-accent/[0.07]`, `hover:bg-line/60`. */
const TRANSLUCENT_FILL = /(?:^|[\s:])bg-[a-z][a-zA-Z0-9-]*\/(?:\d+|\[[^\]]+\])(?=\s|$)/;

/** An ink calibrated to sit just above its floor. */
const CALIBRATED_INK = /(?:^|[\s:])text-(?:ink2|ink3|accent|danger)(?=\s|$)/;

/** An opacity on any ink role at all. */
const INK_ALPHA = /(?:^|[\s:])text-(?:ink|ink2|ink3|accent|danger|on-accent)\/(?:\d+|\[[^\]]+\])(?=\s|$)/;

function offenceIn(literal: string): string | null {
  if (INK_ALPHA.test(literal)) return 'an opacity on an ink role';
  if (TRANSLUCENT_FILL.test(literal) && CALIBRATED_INK.test(literal)) {
    return 'a calibrated ink on a translucent fill';
  }
  return null;
}

describe('tints — text sits only on grounds its ink was proven against', () => {
  // The patterns first, so the scan below cannot pass because a regex matches
  // nothing. Each of the refused strings is one that shipped.
  it.each([
    'rounded-pill bg-accent/15 px-3 py-1 text-micro tracking-label text-accent',
    'bg-danger/15 text-danger',
    'border-accent bg-accent/10 text-accent',
    'bg-line/60 text-ink3',
    'bg-accent/[0.07] text-accent',
    'max-w-[860px] font-display text-h3 text-ink/90',
    'text-accent/90',
  ])('refuses %s', (literal) => {
    expect(offenceIn(literal)).not.toBeNull();
  });

  it.each([
    'rounded-pill border border-accent/50 px-3 py-1 text-micro tracking-label text-accent',
    'rounded-sm bg-accent/15 px-2 py-0.5 text-caption text-ink',
    'border-b border-accent/50 pb-2 hover:border-accent hover:text-accent',
    'bg-raised text-accent',
    'text-accent-surface',
  ])('allows %s', (literal) => {
    expect(offenceIn(literal)).toBeNull();
  });

  it('finds none in the source', () => {
    const files = [WEB_SOURCE, UI_SOURCE].flatMap((root) => walk(root));
    expect(files.length, 'the walker must actually find source').toBeGreaterThan(20);

    const offences: string[] = [];
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const quoted of text.match(LITERAL) ?? []) {
        // Without its quotes. The first version checked the match as found, so
        // a class at the END of a string — `text-accent'` — never met the
        // word-boundary lookahead, and a planted `bg-accent/15 text-accent`
        // passed. The cases above had no quotes, which is why they did not
        // show it; the plant did.
        const literal = quoted.slice(1, -1);
        const offence = offenceIn(literal);
        if (offence) {
          offences.push(`${file.split(/[\\/]/).slice(-2).join('/')}: ${offence} — ${literal}`);
        }
      }
    }

    expect(offences, offences.join('\n')).toEqual([]);
  });
});
