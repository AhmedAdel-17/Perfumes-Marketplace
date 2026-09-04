/**
 * Editorial content — pages, and the immutable revisions visitors are served.
 *
 * Migration 0009 carries the reasoning. The short version: `draftBlocks` is what
 * an editor is typing and `publishedRevisionId` names what the site actually
 * renders, so opening a page to fix a typo cannot change what anybody sees.
 */
import { sql } from 'drizzle-orm';
import {
  index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import type { Block } from '@diyar/domain';
import { platformStaff } from './governance';

export const contentPageState = pgEnum('content_page_state', [
  'draft', 'in_review', 'published', 'archived',
]);

export const contentPages = pgTable('content_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  state: contentPageState('state').default('draft').notNull(),

  /**
   * Typed as the domain's `Block[]`, so a query result is a discriminated union
   * rather than `unknown`. The database checks only that it is a JSON array —
   * a CHECK constraint cannot express "a heading has a level of 2 or 3 unless
   * it is an image, which must have alternative text", and pretending otherwise
   * would put half a rule in SQL where nobody would look for it.
   */
  draftBlocks: jsonb('draft_blocks').$type<Block[]>().default(sql`'[]'::jsonb`).notNull(),

  /** Null until first published. The FK is declared in 0009 — the two tables
   *  reference each other, so Drizzle cannot express it in one direction. */
  publishedRevisionId: uuid('published_revision_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('content_pages_slug_key').on(t.slug),
]);

export const contentRevisions = pgTable('content_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  pageId: uuid('page_id').notNull().references(() => contentPages.id, { onDelete: 'cascade' }),

  /** Snapshotted with the blocks: renaming a page must not retroactively
   *  rename what was published under the old name. */
  title: text('title').notNull(),
  blocks: jsonb('blocks').$type<Block[]>().notNull(),

  publishedBy: uuid('published_by').notNull().references(() => platformStaff.id),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('content_revisions_page_idx').on(t.pageId, t.publishedAt),
]);
