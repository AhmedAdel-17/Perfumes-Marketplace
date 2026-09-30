'use server';

import type { SupportCategory } from '@diyar/domain';
import { api } from '@/core/api';
import { CONTACT } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { apiMessage } from '@/core/api-message';

/**
 * Reaching a person.
 *
 * No authorisation on the way in — this is the form somebody uses before they
 * trust the shop enough to buy anything. Reading a ticket back needs the
 * reference and the phone, like everything else here.
 */

export type OpenResult =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export async function openTicket(input: {
  category: SupportCategory;
  subject: string;
  message: string;
  contactName: string;
  contactPhone: string;
  orderReference: string;
}): Promise<OpenResult> {
  try {
    const created = await api().support.open({
      category: input.category,
      subject: input.subject,
      message: input.message,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      orderReference: input.orderReference.trim() || null,
    });
    return { ok: true, reference: created.reference };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const locale = await getLocale();
    return { ok: false, message: apiMessage(message, locale, CONTACT[locale].failed) };
  }
}

export async function findTicket(reference: string, phone: string) {
  try {
    return await api().support.byReference({ reference, phone });
  } catch {
    // A malformed phone is refused before the query runs, and that is the same
    // answer as "no such ticket" to the person typing.
    return null;
  }
}

export type TicketResult = Awaited<ReturnType<typeof findTicket>>;
