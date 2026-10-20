import { defineMessages } from '../messages';

/**
 * The home page (visual identity v2 — design-reference/redesign/04-laboratoire.html).
 *
 * Formal Arabic for now, like every other screen: the Egyptian register (V-1) is
 * one rewrite of every dictionary at once (task P5.6.3), so the site never speaks
 * two registers on two pages. Founder's call, 15 Oct 2026.
 *
 * WRITTEN FOR THE CUSTOMER (founder, 17 Oct 2026). The home page used to give
 * a whole section to how a house is verified — eight checks, the gate, an
 * "apply as a house" box — and to call the catalogue a "register". That spoke
 * to houses on the page meant for buyers. It now speaks only to someone
 * choosing a perfume; houses have one door, the band at the top of the footer.
 */
export const HOME = defineMessages(
  {
    // A Latin label in both languages: Arabic is never set in the label face.
    kicker: 'Egyptian perfume, curated',
    headline: 'كل عطر،',
    headlineAccent: 'ومعه مصدره.',
    lede: 'اكتشف دور العطور المصرية المستقلّة، وقارن نفحات كل عطر وثباته بصدق، ثم اطلب من أكثر من دار في طلب واحد، والدفع عند الاستلام.',
    browse: 'تصفّح العطور',
    shopByScent: 'تسوّق حسب النفحة',
    meetHouses: 'تعرّف على الدور',

    specimen: 'Specimen',
    delivery: 'التوصيل',
    listSeparator: '، ',
    arrives: (min: string, max: string) => `يصل خلال ${min}–${max} أيام`,


    recentIndex: '02',
    recentTitle: 'وصل حديثًا',
    selectedTitle: 'اختياراتنا',
    fullRegister: (count: string) => `كل العطور (${count})`,
    family: 'العائلة',
    strength: 'التركيز',
    reviewsCount: (count: string) => `(${count})`,
    noReviews: 'لا تقييمات بعد',
    firstImpression: 'FIRST IMPRESSION',
    firstImpressionSaid: (notes: string) => `أول ما تشمّه: ${notes}`,

    notesIndex: '03',
    notesTitle: 'ابحث بالنفحة، لا بالماركة',
    searchFor: (note: string) => `ابحث عن العطور التي فيها ${note}`,

    housesIndex: '04',
    housesTitle: 'الدور',
    allHouses: 'كل الدور',

    empty: 'لا عطور معروضة بعد. أولى الدور في الطريق.',
  },
  {
    kicker: 'Egyptian perfume, curated',
    headline: 'Every perfume,',
    headlineAccent: 'with its source.',
    lede: 'Discover Egypt’s independent perfume houses. Compare every perfume’s notes and longevity honestly, then order from several houses in one checkout — cash on delivery.',
    browse: 'Browse the perfumes',
    shopByScent: 'Shop by scent',
    meetHouses: 'Meet the houses',

    specimen: 'Specimen',
    delivery: 'Delivery',
    listSeparator: ', ',
    arrives: (min: string, max: string) => `Arrives in ${min}–${max} days`,


    recentIndex: '02',
    recentTitle: 'New arrivals',
    selectedTitle: 'Our selection',
    fullRegister: (count: string) => `All perfumes (${count})`,
    family: 'Family',
    strength: 'Strength',
    reviewsCount: (count: string) => `(${count})`,
    noReviews: 'No reviews yet',
    // La Mouillette: the blotter a card draws out under the pointer. The label is
    // Latin in both languages, like every label on a specimen; the sentence is
    // what a screen reader hears instead of the drawing.
    firstImpression: 'FIRST IMPRESSION',
    firstImpressionSaid: (notes: string) => `First impression: ${notes}`,

    notesIndex: '03',
    notesTitle: 'Search by the note, not the brand',
    searchFor: (note: string) => `Find perfumes with ${note}`,

    housesIndex: '04',
    housesTitle: 'The houses',
    allHouses: 'All houses',

    empty: 'No perfumes yet. The first houses are on their way.',
  },
);
