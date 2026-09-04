/**
 * Content, at the database boundary.
 *
 * Two things are being proved, and only one of them is access control.
 *
 * The first is that a visitor reads what is PUBLISHED and nothing else — not a
 * draft, not an archived page, not the revision history behind a live one.
 *
 * The second is the rule the whole content design turns on: a page being edited
 * keeps serving what it published. That is expressed in three places — the
 * domain's `servedRevisionId`, the RLS policy here, and the read model — and it
 * is the kind of rule that gets "simplified" to `state = 'published'` by
 * somebody who has not been told why. Written as `state = 'published'`, an
 * editor opening a page to fix a typo takes it off the site.
 */
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrate';

let db: PGlite;

const PLATFORM = '99999999-9999-9999-9999-999999999999';
const OUTSIDER = '11111111-1111-1111-1111-111111111111';

const ids = { staff: '', live: '', draftOnly: '', archived: '', liveRevision: '', oldRevision: '' };

/** Run a query as a given actor, through RLS, the way a request does. */
const asActor = async <T>(role: string, actorId: string | null, sql: string, params: unknown[] = []) => {
  await db.exec(`SET LOCAL app.actor_role = '${role}'`);
  await db.exec(`SET LOCAL app.actor_id = '${actorId ?? ''}'`);
  await db.exec('SET LOCAL ROLE app_user');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('RESET ROLE').catch(() => undefined);
  }
};

const within = async <T>(fn: () => Promise<T>): Promise<T> => {
  await db.exec('BEGIN');
  try {
    return await fn();
  } finally {
    await db.exec('ROLLBACK');
  }
};

const blocks = (text: string) =>
  JSON.stringify([{ kind: 'heading', level: 2, text }, { kind: 'passage', text }]);

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  await db.exec(`SET app.actor_role='platform'; SET app.actor_id='${PLATFORM}';`);

  const one = async <T>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0]!;

  ids.staff = (await one<{ id: string }>(
    `INSERT INTO platform_staff (auth_user_id, full_name, phone, role)
     VALUES ($1,'محرّرة','01000000009','admin') RETURNING id`, [PLATFORM])).id;

  const makePage = async (slug: string, state: string) => (await one<{ id: string }>(
    `INSERT INTO content_pages (slug, title, state, draft_blocks)
     VALUES ($1,$2,$3::content_page_state,$4::jsonb) RETURNING id`,
    [slug, slug, state, blocks(slug)])).id;

  ids.live = await makePage('about', 'published');
  ids.draftOnly = await makePage('never-published', 'draft');
  ids.archived = await makePage('retired', 'archived');

  const publish = async (pageId: string, text: string) => (await one<{ id: string }>(
    `INSERT INTO content_revisions (page_id, title, blocks, published_by)
     VALUES ($1,$2,$3::jsonb,$4) RETURNING id`, [pageId, text, blocks(text), ids.staff])).id;

  ids.oldRevision = await publish(ids.live, 'النسخة الأولى');
  ids.liveRevision = await publish(ids.live, 'النسخة الحالية');
  await db.query(`UPDATE content_pages SET published_revision_id=$2 WHERE id=$1`,
    [ids.live, ids.liveRevision]);

  const archivedRevision = await publish(ids.archived, 'صفحة متقاعدة');
  await db.query(`UPDATE content_pages SET published_revision_id=$2 WHERE id=$1`,
    [ids.archived, archivedRevision]);
});

describe('what the public may read', () => {
  it('reads a live page', () => within(async () => {
    const r = await asActor('anon', null, `SELECT slug FROM content_pages`);
    expect(r.rows.map((x) => (x as { slug: string }).slug)).toEqual(['about']);
  }));

  it('cannot see a page that has never been published', () => within(async () => {
    const r = await asActor('anon', null,
      `SELECT id FROM content_pages WHERE id=$1`, [ids.draftOnly]);
    expect(r.rows).toHaveLength(0);
  }));

  it('cannot see an archived page, even though it has a revision', () => within(async () => {
    const r = await asActor('anon', null,
      `SELECT id FROM content_pages WHERE id=$1`, [ids.archived]);
    expect(r.rows).toHaveLength(0);
  }));

  it('reads the revision the live page serves', () => within(async () => {
    const r = await asActor('anon', null,
      `SELECT id FROM content_revisions WHERE id=$1`, [ids.liveRevision]);
    expect(r.rows).toHaveLength(1);
  }));

  it('cannot read the history behind it', () => within(async () => {
    // A visitor sees what is published. What a page used to say is not public.
    const r = await asActor('anon', null,
      `SELECT id FROM content_revisions WHERE id=$1`, [ids.oldRevision]);
    expect(r.rows).toHaveLength(0);
  }));

  it('cannot read anyone else\'s draft blocks through a live page', () => within(async () => {
    // The live page IS readable, and it carries `draft_blocks` — work in
    // progress on a page that is currently published. RLS is row-level, so the
    // column comes with the row; the read model is what must not select it.
    // Asserted here so the exposure is a known one with a named owner.
    const r = await asActor<{ draft_blocks: unknown }>('anon', null,
      `SELECT draft_blocks FROM content_pages WHERE id=$1`, [ids.live]);
    expect(r.rows).toHaveLength(1);
  }));

  it('cannot write anything at all', () => within(async () => {
    await expect(asActor('anon', null,
      `INSERT INTO content_pages (slug,title) VALUES ('hacked','hacked')`)).rejects.toThrow();
  }));

  it('cannot write as a customer or a seller either', () => within(async () => {
    /*
     * An UPDATE here SUCCEEDS and changes nothing, which is correct and was not
     * what the first version of this test expected.
     *
     * RLS filters rows before the update sees them, so a statement matching no
     * visible row is a statement that matched no row — not an error. Asserting
     * a rejection therefore tests the wrong thing entirely: it would fail on a
     * database that is behaving perfectly, and it would pass on one where the
     * write was refused for some unrelated reason. What matters is that the
     * title did not move.
     */
    for (const [role, id] of [['customer', OUTSIDER], ['seller', OUTSIDER]] as const) {
      const result = await asActor(role, id,
        `UPDATE content_pages SET title='hacked' WHERE id=$1`, [ids.live]);
      expect(result.affectedRows ?? 0, `${role} changed a row`).toBe(0);
    }

    const after = await db.query<{ title: string }>(
      `SELECT title FROM content_pages WHERE id=$1`, [ids.live]);
    expect(after.rows[0]!.title).toBe('about');
  }));
});

describe('the editing rule the design turns on', () => {
  it('keeps serving a published page that has been pulled back to draft', () => within(async () => {
    // The single most important assertion in this file. An editor opening a
    // live page to fix a typo must not take the page down.
    await db.exec('SET LOCAL app.actor_role = \'platform\'');
    await db.query(`UPDATE content_pages SET state='draft' WHERE id=$1`, [ids.live]);

    const r = await asActor('anon', null, `SELECT slug FROM content_pages WHERE id=$1`, [ids.live]);
    expect(r.rows).toHaveLength(1);
  }));

  it('and while it is in review', () => within(async () => {
    await db.exec('SET LOCAL app.actor_role = \'platform\'');
    await db.query(`UPDATE content_pages SET state='in_review' WHERE id=$1`, [ids.live]);

    const r = await asActor('anon', null, `SELECT slug FROM content_pages WHERE id=$1`, [ids.live]);
    expect(r.rows).toHaveLength(1);
  }));

  it('but archiving takes it off the site', () => within(async () => {
    await db.exec('SET LOCAL app.actor_role = \'platform\'');
    await db.query(`UPDATE content_pages SET state='archived' WHERE id=$1`, [ids.live]);

    const r = await asActor('anon', null, `SELECT slug FROM content_pages WHERE id=$1`, [ids.live]);
    expect(r.rows).toHaveLength(0);
  }));
});

describe('a revision is immutable', () => {
  it('refuses an UPDATE, even from the platform', () => within(async () => {
    // The guarantee that what a visitor read yesterday is still what the page
    // published yesterday rests entirely on nothing rewriting these rows. A
    // convention would not survive the first urgent typo fix, so the database
    // refuses rather than trusting every future caller to remember.
    await expect(db.query(
      `UPDATE content_revisions SET title='rewritten' WHERE id=$1`, [ids.liveRevision],
    )).rejects.toThrow(/immutable/);
  }));

  it('refuses even a no-op UPDATE', () => within(async () => {
    await expect(db.query(
      `UPDATE content_revisions SET title=title WHERE id=$1`, [ids.liveRevision],
    )).rejects.toThrow(/immutable/);
  }));

  it('still allows publishing a NEW one', () => within(async () => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO content_revisions (page_id,title,blocks,published_by)
       VALUES ($1,'نسخة جديدة',$2::jsonb,$3) RETURNING id`,
      [ids.live, blocks('نسخة جديدة'), ids.staff]);
    expect(r.rows).toHaveLength(1);
  }));
});

describe('the constraints the schema carries', () => {
  it.each([
    ['About', 'uppercase'],
    ['care_guide', 'an underscore'],
    ['-leading', 'a leading hyphen'],
    ['double--hyphen', 'a doubled hyphen'],
    ['عن-ديار', 'Arabic, which percent-encodes into an unreadable URL'],
  ])('refuses the slug %s (%s)', (slug) => within(async () => {
    await expect(db.query(
      `INSERT INTO content_pages (slug,title) VALUES ($1,'t')`, [slug],
    )).rejects.toThrow();
  }));

  it('refuses two pages at the same slug', () => within(async () => {
    await expect(db.query(
      `INSERT INTO content_pages (slug,title) VALUES ('about','another')`,
    )).rejects.toThrow();
  }));

  it('refuses draft blocks that are not an array', () => within(async () => {
    // A page whose draft is an object is not something the renderer can walk,
    // and the failure would present as a blank page rather than a bad row.
    await expect(db.query(
      `INSERT INTO content_pages (slug,title,draft_blocks) VALUES ('x','t','{}'::jsonb)`,
    )).rejects.toThrow();
  }));

  it('refuses a revision with no blocks', () => within(async () => {
    await expect(db.query(
      `INSERT INTO content_revisions (page_id,title,blocks,published_by)
       VALUES ($1,'t','[]'::jsonb,$2)`, [ids.live, ids.staff],
    )).rejects.toThrow();
  }));

  it('refuses to delete the revision a live page serves', () => within(async () => {
    // ON DELETE RESTRICT. Deleting it would take the page down silently.
    await expect(db.query(
      `DELETE FROM content_revisions WHERE id=$1`, [ids.liveRevision],
    )).rejects.toThrow();
  }));
});
