/**
 * Photographs, in words a house can act on.
 *
 * Every sentence says what to DO, not what went wrong inside the system. A
 * house told "unsupported_type" has learned nothing; a house told to export the
 * photograph as JPEG or PNG can fix it in ten seconds from the phone it took it
 * on. The numbers in them are the domain's limits, repeated here deliberately
 * in Western digits — this is an operating tool.
 *
 * Typed by key; `packages/api/src/media-vocabulary.test.ts` holds these lists to
 * the domain's objection codes.
 */

/** Why a file cannot become a product photograph. */
export const IMAGE_OBJECTION_AR = {
  unsupported_type: 'الملف ليس صورة يمكن عرضها. استخدم صورة بصيغة JPG أو PNG أو WebP.',
  type_mismatch: 'نوع الملف لا يطابق محتواه. صدّر الصورة من جديد وأعد رفعها.',
  too_large_file: 'الصورة أكبر من 10 ميجابايت. صدّرها بجودة أقل قليلًا وأعد رفعها.',
  too_small_dimensions: 'الصورة صغيرة جدًا وستبدو غير واضحة. يجب ألا يقل ضلعها الأقصر عن 800 بكسل.',
  too_large_dimensions: 'أبعاد الصورة كبيرة جدًا. يجب ألا يزيد ضلعها الأطول عن 8000 بكسل.',
} as const;

/** Why a photograph cannot be added, described or removed. */
export const PHOTO_OBJECTION_AR = {
  too_many_photos: 'وصل المنتج إلى 8 صور، وهو الحد الأقصى. احذف صورة قبل إضافة أخرى.',
  alt_required: 'اكتب وصفًا قصيرًا لما يظهر في الصورة.',
  alt_too_long: 'الوصف أطول من 160 حرفًا. اجعله جملة واحدة.',
  ownership_unconfirmed: 'أكّد أن الدار تملك هذه الصورة أو تملك حق استخدامها.',
  primary_of_live_listing: 'هذه الصورة الرئيسية لمنتج معروض. اختر صورة رئيسية أخرى أولًا، ثم احذف هذه.',
} as const;
