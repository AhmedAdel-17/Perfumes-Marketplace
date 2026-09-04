'use server';

import { revalidatePath } from 'next/cache';
import type { ClaimFinding, ListingGap } from '@diyar/domain';
import { api } from '@/core/api';
import { activeSellerSession } from './actions';

/**
 * A house's own listings.
 *
 * Every action re-resolves the session, for the reason the order actions
 * learned the hard way: a signed cookie proves who somebody WAS when they
 * signed in, not that they still work at that house.
 */

export interface ListingResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly id?: string;
  readonly gaps?: readonly ListingGap[];
  readonly claims?: readonly ClaimFinding[];
}

async function caller() {
  const session = await activeSellerSession();
  if (!session) return null;
  return api({ role: 'seller', id: session.staffAuthUserId }, session.sellerId);
}

const EXPIRED: ListingResult = { ok: false, message: 'انتهت الجلسة. سجّل الدخول من جديد.' };

export async function fetchMyListings() {
  const call = await caller();
  return call ? call.listings.mine() : null;
}

export async function fetchListing(id: string) {
  const call = await caller();
  if (!call) return null;
  return call.listings.get({ id }).catch(() => null);
}

export async function createListing(
  input: { name: string; slug: string; sku: string; brandId: string },
): Promise<ListingResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const { id } = await call.listings.create(input);
    revalidatePath('/seller/listings');
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function saveListing(
  id: string, draft: Record<string, unknown>,
): Promise<ListingResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const result = await call.listings.save({ id, draft: draft as never });
    revalidatePath(`/seller/listings/${id}`);
    return { ok: true, gaps: result.gaps, claims: result.claims };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function submitListing(id: string): Promise<ListingResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    const result = await call.listings.submit({ id });
    revalidatePath('/seller/listings');
    revalidatePath(`/seller/listings/${id}`);
    return {
      ok: result.submitted,
      gaps: result.gaps,
      claims: result.claims,
      ...(result.submitted ? {} : { message: 'المنتج غير جاهز للمراجعة بعد.' }),
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function withdrawListing(id: string): Promise<ListingResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.listings.withdraw({ id });
    revalidatePath('/seller/listings');
    revalidatePath(`/seller/listings/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function archiveListing(id: string): Promise<ListingResult> {
  const call = await caller();
  if (!call) return EXPIRED;
  try {
    await call.listings.archive({ id });
    revalidatePath('/seller/listings');
    revalidatePath(`/seller/listings/${id}`);
    /*
     * The shopfront too. Archiving takes a product off the site, and a route
     * cache that kept serving it would leave a listing buyable that the house
     * has withdrawn — an order for something nobody intends to send.
     */
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
