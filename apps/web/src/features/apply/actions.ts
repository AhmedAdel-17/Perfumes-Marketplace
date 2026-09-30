'use server';

import { api } from '@/core/api';
import { APPLY } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { apiMessage } from '@/core/api-message';

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
    const locale = await getLocale();
    return {
      ok: false,
      // The router's messages already name every objection at once. Anything
      // else gets a neutral sentence.
      message: apiMessage(message, locale, APPLY[locale].failed, 400),
    };
  }
}
