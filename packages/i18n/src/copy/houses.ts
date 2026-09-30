import { defineMessages } from '../messages';

/** The houses directory and a house's own page. */
export const HOUSES = defineMessages(
  {
    title: 'الدور',
    metaDescription: 'دور العطور المصرية المستقلّة المعروضة على ديار.',
    intro: 'كل دار تصنع بنفسها وتشحن بنفسها. اضغط على أي دار لترى عطورها وحكايتها.',
    none: 'لا توجد دور معروضة حاليًا.',
    houseFallbackDescription: (name: string) => `${name} — دار عطور مصرية مستقلّة على ديار.`,
    since: (year: string) => `منذ ${year}`,
    story: 'الحكاية',
    perfumes: 'العطور',
    noPerfumes: 'لا توجد عطور معروضة من هذه الدار حاليًا.',
    deliversTo: 'يوصّل إلى',
  },
  {
    title: 'Houses',
    metaDescription: 'The independent Egyptian perfume houses on DIYAR.',
    intro: 'Every house makes and ships its own perfume. Choose a house to see its perfumes and its story.',
    none: 'No houses are shown at the moment.',
    houseFallbackDescription: (name: string) => `${name} — an independent Egyptian perfume house on DIYAR.`,
    since: (year: string) => `Since ${year}`,
    story: 'The story',
    perfumes: 'Perfumes',
    noPerfumes: 'This house has no perfumes on show at the moment.',
    deliversTo: 'Delivers to',
  },
);
