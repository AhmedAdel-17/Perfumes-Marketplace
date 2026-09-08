-- =============================================================================
-- 0014 — Making the catalogue searchable in Arabic
--
-- Arabic writes the same word several ways and every one is correct: ليل
-- القاهرة and ليل القاهره, أحمد and احمد, عطري and عطرى, with the short vowels
-- and without. A customer who types the ordinary spelling of a product's own
-- name must find it, and comparing raw strings means they will not — they will
-- conclude the shop does not stock it, not that the search is naive.
--
-- `foldArabic` in @diyar/domain folds all of that to one form. This column
-- holds the folded text for each listing, so a search folds the QUERY the same
-- way and compares two things that were prepared identically.
--
-- WHY A COLUMN AND NOT SQL. The fold could be written as nested `translate()`
-- and `regexp_replace()` calls here — and then the rule would exist twice, in
-- two languages, and the copies would drift. They always do. The column is a
-- cache of the domain's function; `search-parity.test.ts` recomputes it from
-- the domain and fails if a row disagrees, so a drifting cache is a red test
-- rather than a product nobody can find.
--
-- WHY NOT A GENERATED COLUMN. Postgres generated columns can only call
-- immutable SQL, which puts us straight back into writing the fold in SQL.
--
-- Populated on write by the listing repository. Backfilled below with a plain
-- lowercase of what exists, which is WRONG for Arabic on purpose: it is a
-- placeholder that the parity test immediately flags, rather than a silent
-- half-correct value that looks fine. Reseeding or resaving each listing fixes
-- it, and before launch there are three rows.
-- =============================================================================

ALTER TABLE products ADD COLUMN search_text text NOT NULL DEFAULT '';--> statement-breakpoint

/*
 * A plain btree index does nothing for `LIKE '%...%'` — the leading wildcard
 * means no prefix to seek on.
 *
 * `pg_trgm` is the extension that makes an unanchored LIKE indexable, by
 * indexing every three-character sequence. It is created IF NOT EXISTS and the
 * index is created inside a DO block, so a Postgres build without the
 * extension available still applies this migration: the column and the search
 * both work, and only the index is missing. A catalogue of this size does not
 * need it yet; a catalogue that does will be running on a server that has it.
 */
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX products_search_trgm ON products USING gin (search_text gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  -- PGlite, which the tests and local development run on, ships no pg_trgm and
  -- fails the CREATE outright rather than skipping it. The catalogue is correct
  -- either way; without the index a search scans, which at this size is nothing
  -- and on a server that has the extension is not the case anyway.
  RAISE NOTICE 'pg_trgm unavailable — catalogue search will scan';
END;
$$;--> statement-breakpoint

UPDATE products SET search_text = lower(coalesce(name, '') || ' ' || coalesce(sku, ''));
