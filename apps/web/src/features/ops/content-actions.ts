'use server';

import { revalidatePath } from 'next/cache';
import type { Block, ImageType, PageState, PublishObjection } from '@diyar/domain';
import { api } from '@/core/api';
import { activeOperator } from './actions';

/**
 * Content actions for the console.
 *
 * Every one of them re-resolves the operator. A signed cookie proves who
 * someone WAS when they signed in; it does not prove they still work here. The
 * order actions learned this the hard way — a revoked staff member kept four
 * hours of access — and content is the one surface where a revoked account can
 * change what the public reads.
 */

export interface ContentResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly objections?: readonly PublishObjection[];
  readonly id?: string;
  /** Where the page ended up, and what it can do from there. */
  readonly state?: PageState;
  readonly canMoveTo?: readonly PageState[];
}

async function caller() {
  const session = await activeOperator();
  if (!session) return null;
  return api(
    { role: 'platform', id: session.authUserId },
    null,
    { staffId: session.staffId, role: session.role, label: session.fullName },
  );
}

const EXPIRED: ContentResult = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' };

export async function createPage(slug: string, title: string): Promise<ContentResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const { id } = await call.content.create({ slug, title });
    revalidatePath('/ops/content');
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function savePageDraft(
  id: string, title: string, blocks: Block[],
): Promise<ContentResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const { objections } = await call.content.saveDraft({ id, title, blocks });
    revalidatePath(`/ops/content/${id}`);
    return { ok: true, objections };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function movePageTo(id: string, to: PageState): Promise<ContentResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const result = await call.content.move({ id, to });

    /*
     * Publishing revalidates the PUBLIC path as well as the console.
     *
     * Without it the editor sees "published" and the site keeps serving the
     * previous revision out of the route cache — the page is live in the
     * database and stale in the browser, which is the most confusing possible
     * outcome of a successful publish.
     *
     * `/` too: the footer lists every live page, so publishing or archiving one
     * changes the footer on every screen of the site.
     */
    revalidatePath('/ops/content');
    revalidatePath(`/ops/content/${id}`);
    revalidatePath('/', 'layout');

    return {
      ok: result.objections.length === 0,
      objections: result.objections,
      state: result.state,
      canMoveTo: result.canMoveTo,
      ...(result.objections.length > 0
        ? { message: 'الصفحة غير جاهزة للنشر بعد.' }
        : {}),
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * Editorial images — a thin transport over `contentImages`, like the house's
 * photograph actions. The browser sends the file straight to storage between
 * the two; nothing here sees the bytes.
 */
export async function startContentImageUpload(pageId: string, contentType: ImageType, byteSize: number) {
  const call = await caller();
  if (!call) return { ok: false as const, message: EXPIRED.message! };
  try {
    return { ok: true as const, value: await call.contentImages.startUpload({ pageId, contentType, byteSize }) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function confirmContentImage(pageId: string, key: string) {
  const call = await caller();
  if (!call) return { ok: false as const, message: EXPIRED.message! };
  try {
    return { ok: true as const, value: await call.contentImages.confirm({ pageId, key }) };
  } catch (error) {
    return { ok: false as const, message: (error as Error).message };
  }
}

export async function restoreRevision(
  id: string, revisionId: string,
): Promise<ContentResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.content.restore({ id, revisionId });
    /*
     * Only the console is revalidated, and that is the point.
     *
     * Restoring loads an old revision into the DRAFT; the site keeps serving
     * whatever it was serving. Revalidating the public paths here would be
     * harmless today and would be the line somebody points at later when
     * asking why an undo went live.
     */
    revalidatePath(`/ops/content/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
