'use server';

import { revalidatePath } from 'next/cache';
import type { ImageType } from '@diyar/domain';
import { api } from '@/core/api';
import { activeSellerSession } from './actions';

/**
 * A house's photographs.
 *
 * Every action re-resolves the session — a signed cookie proves who somebody
 * WAS when they signed in, not that they still work at this house — and every
 * refusal comes back as the router's sentence rather than as a thrown error,
 * so the photograph manager can show it beside the photograph it is about.
 *
 * The upload itself does NOT pass through here. `startPhotoUpload` returns a
 * signed URL and the browser sends the file straight to storage; this server
 * only ever sees the small requests on either side of it.
 */

export type PhotoResult<T = undefined> =
  | ({ readonly ok: true } & (T extends undefined ? object : { readonly value: T }))
  | { readonly ok: false; readonly message: string };

const EXPIRED = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' } as const;

async function caller() {
  const session = await activeSellerSession();
  if (!session) return null;
  return api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId);
}

const failed = (error: unknown) => ({ ok: false as const, message: (error as Error).message });
const refresh = (productId: string) => revalidatePath(`/seller/listings/${productId}`);

export async function fetchPhotos(productId: string) {
  const call = await caller();
  return call ? call.photos.list({ productId }).catch(() => null) : null;
}

export async function startPhotoUpload(input: {
  productId: string;
  contentType: ImageType;
  byteSize: number;
}) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    return { ok: true as const, value: await call.photos.startUpload(input) };
  } catch (error) {
    return failed(error);
  }
}

export async function confirmPhoto(input: {
  productId: string;
  key: string;
  alt: string;
  ownershipConfirmed: boolean;
}) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const photo = await call.photos.confirm(input);
    refresh(input.productId);
    return { ok: true as const, value: photo };
  } catch (error) {
    return failed(error);
  }
}

export async function describePhoto(input: {
  productId: string;
  photoId: string;
  alt: string;
  ownershipConfirmed: boolean;
}) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.photos.describe(input);
    refresh(input.productId);
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}

export async function makePrimaryPhoto(input: { productId: string; photoId: string }) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.photos.makePrimary(input);
    refresh(input.productId);
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}

export async function reorderPhotos(input: { productId: string; photoIds: string[] }) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.photos.reorder(input);
    refresh(input.productId);
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}

export async function removePhoto(input: { productId: string; photoId: string }) {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.photos.remove(input);
    refresh(input.productId);
    return { ok: true as const };
  } catch (error) {
    return failed(error);
  }
}
