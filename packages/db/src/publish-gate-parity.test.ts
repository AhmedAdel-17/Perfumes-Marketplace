/**
 * The publish gate exists twice. This is what keeps the two copies honest.
 *
 * Migration 0001 carries a trigger that refuses to publish a listing with
 * missing required fields. `listingGaps` in the domain is the readable copy —
 * the one a form consults so a seller learns what is missing while they can
 * still fix it, rather than at the moment they press publish.
 *
 * ENGINEERING_PRINCIPLES §4 calls that deliberate duplication: one place to
 * read the rule, one place it cannot be evaded. It is only defensible while the
 * two say the same thing.
 *
 * THEY DID NOT. The domain's first version declared media unenforced, and the
 * database has required a primary image with confirmed ownership and non-blank
 * alt text since the initial migration. A listing would have passed the form,
 * told the seller it was ready, and been refused by the database with an error
 * they had no way to anticipate. Nothing was checking, so nothing said so.
 *
 * The comparison is against the trigger's SOURCE rather than against a list
 * retyped here, because a third copy would just be a third thing to drift.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTING_FIELDS, listingGaps, type ListingDraft } from '@diyar/domain';
import { MIGRATIONS_DIR, migrationFiles } from './migrate';

/** Every field name the database appends to its `missing` array. */
function fieldsTheDatabaseRequires(): string[] {
  const sql = migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  const gate = sql.slice(sql.indexOf('Cannot publish') - 4000, sql.indexOf('Cannot publish'));
  return [...new Set(
    [...gate.matchAll(/array_append\(missing,\s*'([a-z_]+)'\)/g)].map((m) => m[1]!),
  )].sort();
}

/** snake_case → camelCase, and the one name that is not a column. */
const DOMAIN_NAME: Record<string, string> = {
  primary_image_with_confirmed_ownership_and_alt_text: 'primaryImage',
};

const toDomain = (column: string): string =>
  DOMAIN_NAME[column] ?? column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

describe('the publish gate, on both sides', () => {
  it('found the trigger to compare against', () => {
    // Without this the two sets below could both be empty and every assertion
    // in this file would pass while proving nothing.
    expect(fieldsTheDatabaseRequires().length).toBeGreaterThan(10);
  });

  it('requires in the domain everything the database requires', () => {
    const missing = fieldsTheDatabaseRequires()
      .map(toDomain)
      .filter((field) => !(LISTING_FIELDS as readonly string[]).includes(field));

    expect(
      missing,
      'the database refuses to publish without these and the form never asks for them',
    ).toEqual([]);
  });

  it('and every field the domain requires is one the database knows about', () => {
    /*
     * The other direction, and it is allowed to be looser.
     *
     * `name`, `slug`, `sku`, `brand_id`, `price_piastres` and `volume_ml` are
     * NOT NULL columns, so the database enforces them at insert rather than in
     * the publish trigger. The domain asks for them anyway, because a form has
     * to know a field is required BEFORE a constraint refuses the row.
     */
    const enforcedElsewhere = new Set([
      'name', 'slug', 'sku', 'brandId', 'pricePiastres', 'volumeMl', 'fulfilmentHours',
    ]);
    const databaseSide = new Set(fieldsTheDatabaseRequires().map(toDomain));

    const unexplained = (LISTING_FIELDS as readonly string[])
      .filter((field) => !databaseSide.has(field) && !enforcedElsewhere.has(field));

    expect(
      unexplained,
      'the form demands these and nothing downstream does — either the rule is '
      + 'wrong or the database is missing it',
    ).toEqual([]);
  });

  it('agrees that a complete listing is complete', () => {
    // The end-to-end version of the same claim lives in the API tests, where a
    // listing built to satisfy `listingGaps` is actually published through the
    // real trigger. This is the cheap check that runs on every commit.
    const complete: ListingDraft = Object.fromEntries(
      LISTING_FIELDS.map((field) => [field, field === 'primaryImage' ? true : 'x']),
    ) as ListingDraft;

    expect(listingGaps({
      ...complete, pricePiastres: 45000, volumeMl: 50, fulfilmentHours: 48,
      notesTop: ['a'], notesHeart: ['b'], notesBase: ['c'],
      seasons: ['winter'], occasions: ['evening'],
    })).toEqual([]);
  });
});
