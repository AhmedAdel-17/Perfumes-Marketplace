'use server';

import { revalidatePath } from 'next/cache';
import type { Ratings } from '@diyar/domain';
import { api } from '@/core/api';

/**
 * Writing a review, without an account.
 *
 * Both factors travel with EVERY call rather than being exchanged once for a
 * token. A token would be a third credential to issue, store and expire, and
 * the pair the customer already holds — their order number and their phone —
 * is exactly as strong. It is the same decision the tracking screen made.
 *
 * Nothing here decides anything. The router validates, and the repository's
 * WHERE clause is what makes a line item somebody else's line item unreviewable.
 */

export interface ReviewableItem {
  lineItemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  brandName: string;
  volumeMl: number;
  reviewed: boolean;
}

export async function reviewableItems(
  reference: string,
  phone: string,
): Promise<ReviewableItem[]> {
  try {
    return await api().reviews.reviewable({ reference, phone });
  } catch {
    // A malformed phone is refused by Zod before the query runs. To the person
    // at the keyboard that is the same answer as "nothing to review here", and
    // saying anything more precise would confirm which half they got right.
    return [];
  }
}

export type SubmitResult =
  | { ok: true; productSlug: string }
  | { ok: false; message: string };

export async function submitReview(input: {
  reference: string;
  phone: string;
  lineItemId: string;
  ratings: Ratings;
  body: string;
  incentiveDisclosed: boolean;
}): Promise<SubmitResult> {
  try {
    const recorded = await api().reviews.submit({
      reference: input.reference,
      phone: input.phone,
      lineItemId: input.lineItemId,
      ratings: input.ratings,
      body: input.body.trim().length === 0 ? null : input.body,
      incentiveDisclosed: input.incentiveDisclosed,
    });

    /*
     * The product page is `force-dynamic`, so this is not what makes the new
     * review appear — it is what stops a cached rating on the catalogue tiles
     * from disagreeing with the page it links to. A shop that shows 4.6 on the
     * grid and 4.4 on the bottle looks broken in a way nobody can report.
     */
    revalidatePath(`/p/${recorded.productSlug}`);
    revalidatePath('/');

    return { ok: true, productSlug: recorded.productSlug };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return {
      ok: false,
      // The router's messages are already Arabic and already deliberately
      // undifferentiated. Anything unexpected gets the same neutral sentence
      // rather than an English stack trace.
      message: message.length > 0 && message.length < 200
        ? message
        : 'تعذّر حفظ التقييم. حاول مرة أخرى.',
    };
  }
}
