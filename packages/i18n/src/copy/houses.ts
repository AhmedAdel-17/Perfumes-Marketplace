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
    // A Latin label in both languages: Arabic is never set in the label face.
    kicker: 'The houses',
    houseLabel: 'The house',
    // The register's columns, shared by the directory and the home page.
    columns: {
      house: 'الدار',
      city: 'المدينة',
      since: 'منذ',
      perfumes: 'العطور',
      verification: 'التوثيق',
    },
    founded: 'التأسيس',
    verifiedChecks: (passed: string, total: string) => `${passed} من ${total} خطوات موثّقة`,
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
    kicker: 'The houses',
    houseLabel: 'The house',
    columns: {
      house: 'House',
      city: 'City',
      since: 'Since',
      perfumes: 'Perfumes',
      verification: 'Verification',
    },
    founded: 'Founded',
    verifiedChecks: (passed: string, total: string) => `${passed} of ${total} checks verified`,
  },
);
