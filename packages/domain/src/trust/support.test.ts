import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, TICKET_PREFIX,
  generateTicketReference, isOpen, objectionsToOpening, priorityFor,
  type SupportCategory, type TicketStatus,
} from './support';
import { REFERENCE_ALPHABET } from '../services/order-reference';

const bytes = (values: number[]) => () => Uint8Array.from(values);

describe('priority is derived, never chosen', () => {
  it('gives every category a priority', () => {
    // A category added to the tuple and forgotten in the map would fall to
    // whatever a default said, and nobody would notice for a month.
    for (const category of SUPPORT_CATEGORIES) {
      expect(priorityFor(category as SupportCategory), category).toMatch(/^p[0-3]$/);
    }
  });

  it('never lets a public form reach p0', () => {
    /*
     * p0 is an incident the PLATFORM declares — a courier gone dark, a gateway
     * down. A queue whose top severity can be set from a public form is a queue
     * that fills with it, and then the severity means nothing.
     */
    for (const category of SUPPORT_CATEGORIES) {
      expect(priorityFor(category as SupportCategory), category).not.toBe('p0');
    }
  });

  it('puts money and broken bottles above questions', () => {
    expect(priorityFor('damaged_or_wrong')).toBe('p1');
    expect(priorityFor('payment')).toBe('p1');
    // A statutory clock is running on a privacy request.
    expect(priorityFor('privacy')).toBe('p1');
    expect(priorityFor('product_question')).toBe('p3');
  });
});

describe('what a ticket has to be before it is opened', () => {
  const open = (overrides: Partial<{ subject: string; message: string }> = {}) =>
    objectionsToOpening({ subject: 'الطلب لم يصل', message: 'مرّ أسبوع', ...overrides });

  it('accepts an ordinary question', () => {
    expect(open()).toEqual([]);
  });

  it('does NOT require an order number', () => {
    /*
     * Somebody asking "do you deliver to Aswan" before they buy is exactly the
     * person this form exists for. A required order number turns a pre-sale
     * question into a lost sale.
     */
    expect(open({ subject: 'هل تشحنون لأسوان؟', message: 'أفكّر في الطلب' })).toEqual([]);
  });

  it('refuses an empty subject or an empty message', () => {
    expect(open({ subject: '   ' })).toContain('subject_required');
    expect(open({ message: '  \n ' })).toContain('message_required');
  });

  it('refuses one longer than a person will read', () => {
    expect(open({ subject: 'ا'.repeat(SUBJECT_MAX + 1) })).toContain('subject_too_long');
    expect(open({ message: 'ا'.repeat(MESSAGE_MAX + 1) })).toContain('message_too_long');
  });

  it('measures after trimming', () => {
    expect(open({ subject: `${'ا'.repeat(SUBJECT_MAX)}   ` })).toEqual([]);
  });

  it('reports every objection at once', () => {
    const objections = open({ subject: '', message: 'ا'.repeat(MESSAGE_MAX + 1) });
    expect(objections).toContain('subject_required');
    expect(objections).toContain('message_too_long');
  });
});

describe('the ticket reference', () => {
  it('uses the SAME alphabet as an order reference', () => {
    // It is read down a phone line too. Every confusable pair is already gone
    // from that alphabet, and a second alphabet here would be a second place
    // to get 0/O wrong.
    const reference = generateTicketReference(bytes([0, 1, 2, 3, 4, 5, 6, 7]));
    const body = reference.split('-')[1]!;
    for (const character of body) {
      expect(REFERENCE_ALPHABET, `"${character}" is not in the alphabet`).toContain(character);
    }
  });

  it('is prefixed DS, not DY', () => {
    /*
     * So a customer who quotes a ticket number at the order tracking form is
     * told plainly that it is not an order number, rather than being told their
     * order does not exist — which is the same message a wrong phone gets, and
     * would send them looking for a problem that is not there.
     */
    const reference = generateTicketReference(bytes([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(reference.startsWith(`${TICKET_PREFIX}-`)).toBe(true);
    expect(reference.startsWith('DY-')).toBe(false);
  });

  it('is deterministic for given randomness', () => {
    // Randomness is injected precisely so the alphabet is provable.
    const seed = [10, 20, 30, 40, 50, 60, 70, 80];
    expect(generateTicketReference(bytes(seed))).toBe(generateTicketReference(bytes(seed)));
  });
});

describe('open means open', () => {
  it('counts waiting as still open', () => {
    // "Waiting on the customer" is not resolved. A dashboard that treats it as
    // closed is a dashboard reporting a queue length that is not the queue.
    const expected: Record<TicketStatus, boolean> = {
      open: true, waiting: true, resolved: false, closed: false,
    };
    for (const [status, want] of Object.entries(expected)) {
      expect(isOpen(status as TicketStatus), status).toBe(want);
    }
  });
});
