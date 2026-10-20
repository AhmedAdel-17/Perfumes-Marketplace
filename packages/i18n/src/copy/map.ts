import { defineMessages } from '../messages';

/**
 * The scent map (La Carte olfactive, 20 Oct 2026): the catalogue as a night
 * sky. Counts are printed as figures after a label ("عطورها على الخريطة: ٣")
 * rather than inside a sentence, so no noun has to agree with a number.
 * The latin lines are labels, Latin in both languages like every label.
 */
export const MAP = defineMessages(
  {
    metaTitle: 'خريطة العطور',
    metaDescription: 'كل عطر في عائلته، وكل نفحة في عائلتها: خريطة لعطور دور مصرية مستقلة تقرأ منها شخصية كل عطر.',
    kicker: 'LA CARTE OLFACTIVE',
    title: 'خريطة العطور',
    lede: 'كل عطر في عائلته، وكل نفحة نجمة في عائلتها، والخيوط تصل كل عطر بنفحاته — فشخصية العطر هي كوكبته. مرّر على عطر لترى كوكبته، أو على نجمة لترى كل عطر يحملها.',
    howto: 'اسحب لتدوير السماء، واضغط لتختار.',
    howtoLatin: 'DRAG · PRESS · ARROWS',
    hint: 'اسحب لتدوير السماء',
    hintLatin: 'DRAG TO TURN THE SKY',
    skyLabel: 'خريطة العطور: العائلات والعطور والنفحات',
    centre: (perfumes: number, notes: number) =>
      `${perfumes} ${perfumes === 1 ? 'PERFUME' : 'PERFUMES'} · ${notes} ${notes === 1 ? 'NOTE' : 'NOTES'}`,
    familyCentre: (family: string, perfumes: number) => `${family} · ${perfumes} ${perfumes === 1 ? 'PERFUME' : 'PERFUMES'}`,
    back: '→ كل الخريطة',
    noteLabel: (note: string) => `نفحة ${note}`,
    perfumeLabel: (name: string, house: string) => `${name} من ${house}`,
    familyLabel: (family: string) => `عائلة «${family}»`,
    family: 'العائلة',
    open: 'صفحة العطر',
    day: 'يومه على الجلد',
    noteStory: (family: string, count: string, places: string) =>
      `نفحة من عائلة «${family}». عطورها على الخريطة: ${count} — ${places}.`,
    inTier: {
      top: (name: string) => `في قمة ${name}`,
      heart: (name: string) => `في قلب ${name}`,
      base: (name: string) => `في قاعدة ${name}`,
    },
    familyStory: (count: string, notes: string) => `عطورها على الخريطة حتى الآن: ${count}. ونفحاتها: ${notes}.`,
    familyEmpty: 'لا عطور في هذه العائلة بعد. حين تنضم دار بعطر منها يظهر هنا في مكانه.',
    join: (items: readonly string[]) => new Intl.ListFormat('ar', { type: 'conjunction' }).format(items),
  },
  {
    metaTitle: 'The scent map',
    metaDescription: 'Every perfume in its family and every note in its own: a map of independent Egyptian houses’ perfumes, from which each one’s character can be read.',
    kicker: 'LA CARTE OLFACTIVE',
    title: 'The scent map',
    lede: 'Every perfume in its family, every note a star in its own, and threads from each perfume to its notes — so a perfume’s character is its constellation. Pass over a perfume to see it, or over a star to see every perfume that carries it.',
    howto: 'Drag to turn the sky, and press to choose.',
    howtoLatin: 'DRAG · PRESS · ARROWS',
    hint: 'Drag to turn the sky',
    hintLatin: 'DRAG TO TURN THE SKY',
    skyLabel: 'The scent map: families, perfumes and notes',
    centre: (perfumes: number, notes: number) =>
      `${perfumes} ${perfumes === 1 ? 'PERFUME' : 'PERFUMES'} · ${notes} ${notes === 1 ? 'NOTE' : 'NOTES'}`,
    familyCentre: (family: string, perfumes: number) => `${family} · ${perfumes} ${perfumes === 1 ? 'PERFUME' : 'PERFUMES'}`,
    back: '← The whole map',
    noteLabel: (note: string) => `The note ${note}`,
    perfumeLabel: (name: string, house: string) => `${name} by ${house}`,
    familyLabel: (family: string) => `The ${family} family`,
    family: 'Family',
    open: 'The perfume',
    day: 'Its day on the skin',
    noteStory: (family: string, count: string, places: string) =>
      `A note of the ${family} family. Perfumes carrying it on the map: ${count} — ${places}.`,
    inTier: {
      top: (name: string) => `in the top of ${name}`,
      heart: (name: string) => `in the heart of ${name}`,
      base: (name: string) => `in the base of ${name}`,
    },
    familyStory: (count: string, notes: string) => `Its perfumes on the map so far: ${count}. Its notes: ${notes}.`,
    familyEmpty: 'No perfumes in this family yet. When a house joins with one, it appears here in its place.',
    join: (items: readonly string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items),
  },
);
