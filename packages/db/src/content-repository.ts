/**
 * Content storage, on Drizzle.
 *
 * The adapter for `ContentRepository`. Everything interesting is in `publish`.
 */
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import type {
  Block, ContentPage, ContentRepository, ContentRevision, LivePage, PageState,
} from '@diyar/domain';
import * as schema from './schema';
import type { DiyarDatabase } from './repositories';

type PageRow = typeof schema.contentPages.$inferSelect;
type RevisionRow = typeof schema.contentRevisions.$inferSelect;

const toPage = (row: PageRow): ContentPage => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  state: row.state as PageState,
  draftBlocks: row.draftBlocks,
  titleEn: row.titleEn,
  draftBlocksEn: row.draftBlocksEn,
  publishedRevisionId: row.publishedRevisionId,
});

const toRevision = (row: RevisionRow): ContentRevision => ({
  id: row.id,
  pageId: row.pageId,
  title: row.title,
  blocks: row.blocks,
  titleEn: row.titleEn,
  blocksEn: row.blocksEn,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt,
});

export const contentRepository = (db: DiyarDatabase): ContentRepository => ({
  async list() {
    const rows = await db.select().from(schema.contentPages)
      .orderBy(schema.contentPages.slug);
    return rows.map(toPage);
  },

  async findById(id) {
    const [row] = await db.select().from(schema.contentPages)
      .where(eq(schema.contentPages.id, id)).limit(1);
    return row ? toPage(row) : null;
  },

  async findBySlug(slug) {
    const [row] = await db.select().from(schema.contentPages)
      .where(eq(schema.contentPages.slug, slug)).limit(1);
    return row ? toPage(row) : null;
  },

  async findLive(slug) {
    /*
     * Joined on `published_revision_id`, so what comes back is the FROZEN
     * revision — never `draft_blocks`, which is what an editor is currently
     * typing into this same row.
     *
     * The predicate repeats what the RLS policy already enforces, and that is
     * on purpose: this method is the site's only content read, and it should be
     * correct when read on its own rather than only in the presence of a policy
     * in a file two directories away.
     */
    const [row] = await db
      .select({
        slug: schema.contentPages.slug,
        title: schema.contentRevisions.title,
        blocks: schema.contentRevisions.blocks,
        titleEn: schema.contentRevisions.titleEn,
        blocksEn: schema.contentRevisions.blocksEn,
        publishedAt: schema.contentRevisions.publishedAt,
      })
      .from(schema.contentPages)
      .innerJoin(
        schema.contentRevisions,
        eq(schema.contentRevisions.id, schema.contentPages.publishedRevisionId),
      )
      .where(and(
        eq(schema.contentPages.slug, slug),
        ne(schema.contentPages.state, 'archived'),
      ))
      .limit(1);

    return row ? (row as LivePage) : null;
  },

  async listLive() {
    return db
      .select({
        slug: schema.contentPages.slug,
        title: schema.contentRevisions.title,
        titleEn: schema.contentRevisions.titleEn,
      })
      .from(schema.contentPages)
      .innerJoin(
        schema.contentRevisions,
        eq(schema.contentRevisions.id, schema.contentPages.publishedRevisionId),
      )
      .where(and(
        isNotNull(schema.contentPages.publishedRevisionId),
        ne(schema.contentPages.state, 'archived'),
      ))
      .orderBy(schema.contentPages.slug);
  },

  async create({ slug, title }) {
    const [row] = await db.insert(schema.contentPages)
      .values({ slug, title }).returning();
    return toPage(row!);
  },

  async saveDraft(id, { title, blocks, titleEn, blocksEn }) {
    await db.update(schema.contentPages)
      .set({
        title,
        draftBlocks: blocks as Block[],
        // Absent means "not touched": an editor saving only the Arabic tab
        // must not blank the English one.
        ...(titleEn !== undefined ? { titleEn } : {}),
        ...(blocksEn !== undefined ? { draftBlocksEn: blocksEn as Block[] } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.contentPages.id, id));
  },

  async setState(id, state) {
    await db.update(schema.contentPages)
      .set({ state, updatedAt: new Date() })
      .where(eq(schema.contentPages.id, id));
  },

  async publish(id, publishedBy) {
    /*
     * TWO WRITES, ONE UNIT.
     *
     * Freezing the draft into a revision and pointing the page at it are a
     * single fact — "this is now live" — expressed as two statements. Split
     * across two calls, a failure between them leaves either a revision nothing
     * serves (invisible, harmless, accumulating) or a page pointing at a
     * revision that was never written (a foreign key violation on the read
     * path, which is the shopfront).
     *
     * There is no explicit transaction here because there is already one: every
     * repository method runs inside `DrizzleUnitOfWork.transaction`, which is
     * also what sets the actor GUCs the RLS policies read. Opening a nested one
     * would create a savepoint and quietly change what a rollback means.
     */
    const [page] = await db.select().from(schema.contentPages)
      .where(eq(schema.contentPages.id, id)).limit(1);
    if (!page) throw new Error(`No content page ${id}`);

    const [revision] = await db.insert(schema.contentRevisions).values({
      pageId: id,
      title: page.title,
      blocks: page.draftBlocks,
      titleEn: page.titleEn,
      blocksEn: page.draftBlocksEn,
      publishedBy,
    }).returning();

    await db.update(schema.contentPages)
      .set({
        publishedRevisionId: revision!.id,
        state: 'published',
        updatedAt: new Date(),
      })
      .where(eq(schema.contentPages.id, id));

    return toRevision(revision!);
  },

  async restore(pageId, revisionId) {
    // Both ids in the WHERE clause. Matching the page afterwards in TypeScript
    // is the version of this that lets one page's history overwrite another's
    // draft — the same shape as the order-lookup hole this project already
    // shipped once.
    const [revision] = await db.select().from(schema.contentRevisions)
      .where(and(
        eq(schema.contentRevisions.id, revisionId),
        eq(schema.contentRevisions.pageId, pageId),
      ))
      .limit(1);
    if (!revision) return null;

    await db.update(schema.contentPages)
      .set({
        title: revision.title,
        draftBlocks: revision.blocks,
        titleEn: revision.titleEn,
        draftBlocksEn: revision.blocksEn,
        updatedAt: new Date(),
      })
      .where(eq(schema.contentPages.id, pageId));

    return toRevision(revision);
  },

  async revisions(pageId) {
    const rows = await db.select().from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.pageId, pageId))
      .orderBy(desc(schema.contentRevisions.publishedAt));
    return rows.map(toRevision);
  },
});
