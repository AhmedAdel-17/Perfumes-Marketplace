/**
 * Interface words live in `@diyar/i18n`, never in a component (P5.6.2).
 *
 * The English site exists only if every word a visitor reads comes from a
 * catalogue that has an English half. A sentence typed straight into JSX
 * compiles, renders, looks right in Arabic — and is the one line left in Arabic
 * on the English page. Nothing about doing it wrong feels wrong, so the rule
 * has to fail a test.
 *
 * Checked by script, not by locale: Arabic letters outside comments. An English
 * literal slipping in would be the mirror fault, but it cannot be told apart
 * from class names and keys without a parser; the catalogue types catch the
 * rest, because a component that takes its words from a catalogue has no
 * English of its own to forget.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname);

/**
 * Not translated YET — the seller portal and the ops console are steps 4 and 5
 * of P5.6.2, and middleware keeps them Arabic until then. Each entry is removed
 * when its step lands; the list only ever shrinks.
 */
const NOT_YET_TRANSLATED = [
  'app/seller/',
  'app/ops/',
  'features/seller/',
  'features/ops/',
  'features/media/upload.ts',
];

const ARABIC = /[؀-ۿ]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Source with comments removed — the notes in this codebase quote Arabic on purpose. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('interface words come from the copy layer', () => {
  const files = sourceFiles(SRC)
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((path) => !NOT_YET_TRANSLATED.some((prefix) => path.startsWith(prefix)));

  it('scans the customer site', () => {
    expect(files).toContain('app/page.tsx');
    expect(files).toContain('features/checkout/CheckoutForm.tsx');
  });

  it('finds no Arabic literal in customer-site code', () => {
    const offenders = files.filter((path) =>
      withoutComments(readFileSync(join(SRC, path), 'utf8')).split('\n').some((line) => ARABIC.test(line)));
    expect(offenders).toEqual([]);
  });

  it('would catch one', () => {
    expect(ARABIC.test(withoutComments("const x = 'تأكيد'; // تعليق"))).toBe(true);
    expect(ARABIC.test(withoutComments('/* تعليق */ const url = "https://x";'))).toBe(false);
  });
});
