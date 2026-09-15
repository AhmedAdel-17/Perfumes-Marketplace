/**
 * Every audit entry a router writes can be read in Arabic.
 *
 * `describeAuditChange` shows an unknown field under its raw key rather than
 * dropping it, because an audit screen that omits what it cannot translate can
 * be made to omit things. That fallback is a safety net. THIS is what keeps it
 * from becoming the normal case: a router that starts recording a field, an
 * entity or an action the copy layer has no word for fails here, before an
 * operator ever sees `heldGrossPiastres` on the screen.
 *
 * A static read of the router sources rather than a run of every decision,
 * because the fields are literals at the call site and a run would need a
 * fixture for every money path just to learn their names.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '@diyar/domain';
import { AUDIT_ACTION_AR, AUDIT_ENTITY_AR, AUDIT_FIELD_AR } from '@diyar/i18n';

const ROUTERS = join(import.meta.dirname, 'routers');

/** Every `audit.record({ ... })` call in the routers, as source text. */
function recordCalls(): { file: string; body: string }[] {
  const calls: { file: string; body: string }[] = [];
  for (const file of readdirSync(ROUTERS).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(ROUTERS, file), 'utf8');
    // Up to the first `});` at the call's own indentation or deeper — every
    // call site closes this way, and a nested object closes with `}),` or `})`.
    for (const match of source.matchAll(/audit\.record\(\{([\s\S]*?)\n\s*\}\);/g)) {
      calls.push({ file, body: match[1]! });
    }
  }
  return calls;
}

/** The keys of every object literal passed to JSON.stringify in a call. */
function recordedFields(body: string): string[] {
  const fields: string[] = [];
  for (const match of body.matchAll(/JSON\.stringify\(\{([\s\S]*?)\}\)/g)) {
    const literal = match[1]!;
    // `key: value` — a name followed by a colon. Values like `?? null` are
    // followed by a comma, not a colon, so they are not mistaken for keys.
    for (const key of literal.matchAll(/([A-Za-z_]\w*)\s*:/g)) fields.push(key[1]!);
    // Shorthand `{ key }` — a bare name directly after the opening or a comma.
    for (const key of literal.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*(?=,|$)/g)) fields.push(key[1]!);
  }
  return fields;
}

describe('every audit entry a router writes has words', () => {
  const calls = recordCalls();

  it('finds the call sites, so an unmatched pattern cannot pass vacuously', () => {
    // Nine at the time of writing: payouts twice, returns, reviews twice,
    // listings, content, applications twice.
    expect(calls.length).toBeGreaterThanOrEqual(9);
  });

  it('names every field that goes into before and after', () => {
    // A pattern that stopped matching would find no fields and pass. Twenty
    // distinct names are written today; well under that means the scan broke.
    const found = new Set(calls.flatMap(({ body }) => recordedFields(body)));
    expect(found.size, `the field scan found only: ${[...found].join(', ')}`).toBeGreaterThanOrEqual(15);

    const missing = new Set<string>();
    for (const { file, body } of calls) {
      for (const field of recordedFields(body)) {
        // Identifiers are deliberately not shown — see `describeAuditChange`.
        if (field === 'id' || field.endsWith('Id')) continue;
        if (!(field in AUDIT_FIELD_AR)) missing.add(`${file}: ${field}`);
      }
    }
    expect([...missing], 'add these to AUDIT_FIELD_AR in packages/i18n/src/audit.ts').toEqual([]);
  });

  it('names every entity a decision is recorded against', () => {
    const missing: string[] = [];
    for (const { file, body } of calls) {
      const table = /entityTable:\s*'([a-z_]+)'/.exec(body)?.[1];
      expect(table, `${file}: an audit call with no literal entityTable`).toBeDefined();
      if (table && !(table in AUDIT_ENTITY_AR)) missing.push(`${file}: ${table}`);
    }
    expect(missing, 'add these to AUDIT_ENTITY_AR').toEqual([]);
  });

  it('has a word for every action the database enum allows, and no extras', () => {
    // The two lists live in packages that cannot import each other; this is
    // the one place both are in scope.
    expect(Object.keys(AUDIT_ACTION_AR).sort()).toEqual([...AUDIT_ACTIONS].sort());
  });
});
