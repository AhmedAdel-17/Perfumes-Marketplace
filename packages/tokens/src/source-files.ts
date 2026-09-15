/**
 * The source the design guards read.
 *
 * Shared by `drift.test.ts` and `tint.test.ts` so both walk the same files and
 * strip comments the same way — two walkers would disagree about what "the
 * source" is on the first day one of them grew an exception. Test support only;
 * nothing in the package's public entry imports it.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const WEB_SOURCE = join(import.meta.dirname, '../../../apps/web/src');
export const UI_SOURCE = join(import.meta.dirname, '../../../packages/ui/src');
export const TOKENS_SOURCE = join(import.meta.dirname, '..');

const SOURCE = /\.(ts|tsx|css)$/;

/** Block and line comments, so prose about a colour is not mistaken for one. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Every source file under `dir`, skipping dependencies, build output and dotfiles. */
export function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}
