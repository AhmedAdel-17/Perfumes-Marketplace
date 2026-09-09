'use server';

import { api } from '@/core/api';

/**
 * A house applying to join.
 *
 * No authorisation at all: an applicant is by definition somebody with no
 * account. The narrowness lives in the `intake` service role — migration 0018
 * lets it create a seller with `status = 'applied'` and nothing else.
 */

export type ApplyResult =
  | { ok: true; slug: string }
  | { ok: false; message: string };

export async function submitApplication(input: {
  tradingName: string;
  latinName: string;
  ownerName: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  note: string;
}): Promise<ApplyResult> {
  try {
    const created = await api().applications.submit({
      tradingName: input.tradingName,
      latinName: input.latinName,
      ownerName: input.ownerName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail.trim() || null,
      city: input.city,
      note: input.note,
    });
    return { ok: true, slug: created.slug };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return {
      ok: false,
      // The router's messages already name every objection at once and are
      // already Arabic. Anything else gets a neutral sentence.
      message: message.length > 0 && message.length < 400
        ? message
        : 'تعذّر إرسال الطلب. حاول مرة أخرى.',
    };
  }
}
