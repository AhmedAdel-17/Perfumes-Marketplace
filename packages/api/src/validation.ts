/**
 * Zod schemas — the only place untrusted input enters the system.
 *
 * ENGINEERING_PRINCIPLES §7: Zod at every external boundary. Every constraint
 * here mirrors one the domain or the database also enforces; this layer exists
 * so a malformed request is rejected with a readable Arabic message before it
 * reaches either.
 */
import { z } from 'zod';
import { GOVERNORATES } from '@diyar/domain';

/** Egyptian mobile. Phone is the primary customer identifier (CLAUDE.md §16). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+201|01)[0-2,5]{1}[0-9]{8}$/, 'رقم هاتف مصري غير صالح');

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

export const rejectionReasons = [
  'out_of_stock', 'pricing_error', 'area_not_served', 'suspected_fraud',
] as const;

/** Doc 06 §7 — declining REQUIRES a coded reason. No free text. */
export const declineSchema = z.object({
  subOrderId: uuidSchema,
  reason: z.enum(rejectionReasons, {
    errorMap: () => ({ message: 'اختر سببًا من القائمة' }),
  }),
  note: z.string().trim().max(500).optional(),
}).strict();

export const confirmSchema = z.object({ subOrderId: uuidSchema }).strict();
