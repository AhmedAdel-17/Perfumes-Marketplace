import { defineMessages } from '../messages';

export const HOME = defineMessages(
  {
    headline: 'دور العطور',
    headlineAccent: 'المصرية',
    intro: (perfumes: string) => `${perfumes} من دور مختارة، بمعلومات موحّدة وتقييمات موثّقة بالشراء.`,
    promise: 'كل دار تصنع عطرها وتشحنه بنفسها.',
    promiseSecond: ' نحن نضمن أن ما تقرأه عنه صحيح.',
    allPerfumes: 'كل العطور',
    empty: 'لم تُنشر أي عطور بعد. الدور الأولى قيد التوثيق.',
    moreHouses: 'دور جديدة تنضم كل أسبوع.',
  },
  {
    headline: 'Perfume houses',
    headlineAccent: 'of Egypt',
    intro: (perfumes: string) => `${perfumes} from selected houses, described to one standard, with reviews from verified buyers.`,
    promise: 'Every house makes and ships its own perfume.',
    promiseSecond: ' We guarantee that what you read about it is accurate.',
    allPerfumes: 'All perfumes',
    empty: 'No perfumes are published yet. The first houses are being verified.',
    moreHouses: 'New houses join every week.',
  },
);
