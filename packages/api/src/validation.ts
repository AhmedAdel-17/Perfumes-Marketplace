/**
 * Zod schemas — the only place untrusted input enters the system.
 *
 * ENGINEERING_PRINCIPLES §7: Zod at every external boundary. Every constraint
 * here mirrors one the domain or the database also enforces; this layer exists
 * so a malformed request is rejected with a readable Arabic message before it
 * reaches either.
 */
import { z } from 'zod';
import { GOVERNORATES, REJECTION_REASONS } from '@diyar/domain';

/**
 * Egyptian mobile. Phone is the primary customer identifier (CLAUDE.md §16).
 *
 * The operator digit is `[0125]` — Vodafone 0, Etisalat 1, Orange 2, WE 5.
 *
 * It was written `[0-2,5]`, which reads like "0 to 2, or 5" and is not. Inside
 * a character class a comma is a LITERAL COMMA, so `01,12345678` validated as
 * an Egyptian mobile number. On a site where the phone IS the identity — it
 * addresses the customer's order, gates the tracking page, and will carry the
 * one-time code — that is a corrupt identity accepted at the front door.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+201|01)[0125][0-9]{8}$/, 'رقم هاتف مصري غير صالح');

export const slugSchema = z.string().trim().min(1).max(200)
  .regex(/^[a-z0-9-]+$/, 'معرّف غير صالح');

export const uuidSchema = z.string().uuid('معرّف غير صالح');

/** No postal code — Egypt does not use them (CLAUDE.md §16). */
export const addressSchema = z.object({
  governorate: z.enum(GOVERNORATES),
  city: z.string().trim().min(1, 'أدخل المدينة'),
  area: z.string().trim().min(1, 'أدخل الحي'),
  street: z.string().trim().min(1, 'أدخل الشارع'),
  building: z.string().trim().min(1, 'أدخل رقم العقار'),
  floor: z.string().trim().optional(),
  apartment: z.string().trim().optional(),
  landmark: z.string().trim().optional(),
}).strict();

export const cartLineSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int('الكمية يجب أن تكون رقمًا صحيحًا').min(1, 'الكمية على الأقل واحد').max(99),
}).strict();

export const placeOrderSchema = z.object({
  contactName: z.string().trim().min(1, 'أدخل الاسم').max(200),
  contactPhone: phoneSchema,
  address: addressSchema,
  lines: z.array(cartLineSchema).min(1, 'الحقيبة فارغة').max(50),
  paymentMethod: z.enum(['cod', 'card', 'wallet']),
}).strict();

/**
 * Re-exported from the domain rather than retyped.
 *
 * There were three copies of this list — here, the domain, and a fourth
 * hand-written one in the seller portal that had drifted to a code the
 * database enum does not contain. That made one of the four decline buttons
 * dead: it posted `cannot_fulfil_sla`, this schema refused it, and the house
 * saw a reason it could click and nothing happen.
 */
export const rejectionReasons = REJECTION_REASONS;

/** Doc 06 §7 — declining REQUIRES a coded reason. No free text. */
export const declineSchema = z.object({
  subOrderId: uuidSchema,
  reason: z.enum(rejectionReasons, {
    errorMap: () => ({ message: 'اختر سببًا من القائمة' }),
  }),
  note: z.string().trim().max(500).optional(),
}).strict();

export const confirmSchema = z.object({ subOrderId: uuidSchema }).strict();
