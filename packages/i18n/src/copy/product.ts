import { defineMessages } from '../messages';

/** The product page and the pieces it is built from: tile, buy block, notes, curve, meters. */
export const PRODUCT = defineMessages(
  {
    notFound: 'غير موجود',
    metaDescription: (name: string, house: string, concentration: string, ml: string) =>
      `${name} من ${house}. ${concentration}، ${ml} مل.`,
    ml: 'مل',
    inStock: 'متاح الآن',
    outOfStock: 'غير متاح حاليًا',
    addToBag: 'أضف إلى الحقيبة',
    added: 'أُضيف إلى الحقيبة',
    longevity: 'الثبات',
    projection: 'الانتشار',
    allItsPerfumes: 'كل عطورها ←',
    shipsItself: (min: string, max: string, days: string) =>
      `تُجهّز الدار وتشحن طلبها بنفسها. يصل خلال ${min} إلى ${max} ${days}.`,
    fromOtherHouses: 'من دور أخرى',
    topNotes: 'القمة',
    heartNotes: 'القلب',
    baseNotes: 'القاعدة',
    topWhen: 'أول ٣٠ دقيقة',
    heartWhen: 'ساعتان',
    baseWhen: 'حتى ٨ ساعات',
    curveLabel: 'منحنى تطوّر العطر على مدار ثماني ساعات',
    spray: 'الرشّة',
  },
  {
    notFound: 'Not found',
    metaDescription: (name: string, house: string, concentration: string, ml: string) =>
      `${name} by ${house}. ${concentration}, ${ml} ml.`,
    ml: 'ml',
    inStock: 'Available now',
    outOfStock: 'Currently unavailable',
    addToBag: 'Add to bag',
    added: 'Added to bag',
    longevity: 'Longevity',
    projection: 'Projection',
    allItsPerfumes: 'All its perfumes →',
    shipsItself: (min: string, max: string, days: string) =>
      `The house prepares and ships its own orders. Arrives in ${min} to ${max} ${days}.`,
    fromOtherHouses: 'From other houses',
    topNotes: 'Top notes',
    heartNotes: 'Heart notes',
    baseNotes: 'Base notes',
    topWhen: 'First 30 minutes',
    heartWhen: 'Two hours',
    baseWhen: 'Up to 8 hours',
    curveLabel: 'How the perfume evolves over eight hours',
    spray: 'Spray',
  },
);
