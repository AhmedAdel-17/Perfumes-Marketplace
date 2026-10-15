import { defineMessages } from '../messages';

/**
 * The home page (visual identity v2 — design-reference/redesign/04-laboratoire.html).
 *
 * Formal Arabic for now, like every other screen: the Egyptian register (V-1) is
 * one rewrite of every dictionary at once (task P5.6.3), so the site never speaks
 * two registers on two pages. Founder's call, 15 Oct 2026.
 *
 * `checks` is keyed by the database's own `verification_control` codes, so a
 * ninth control added there is a type error here rather than a check the public
 * page silently forgets. Each line says what the EVIDENCE is (doc 06 §3) — the
 * page makes a promise about verification, and it can only promise what the
 * checklist actually asks for.
 */
export const HOME = defineMessages(
  {
    // A Latin label in both languages: Arabic is never set in the label face.
    kicker: 'No. 01 — The register of houses',
    headline: 'كل عطر،',
    headlineAccent: 'ومعه مصدره.',
    lede: 'نسجّل كل دار عطور مصرية، ونصف كل عطر بالطريقة نفسها: نفحاته، وتركيزه، ومن قاس ثباته — الدار، أو اختبارنا، أو من اشتروه.',
    browse: 'تصفّح العطور',
    howWeVerify: 'كيف نوثّق الدار',

    specimen: 'Specimen',
    verifiedStamp: 'Verified',
    delivery: 'التوصيل',
    listSeparator: '، ',
    arrives: (min: string, max: string) => `يصل خلال ${min}–${max} أيام`,

    checksIndex: '02',
    checksTitle: 'ثماني خطوات قبل أن تبيع أي دار',
    checksNote: 'الدار التي تستوفي سبعًا من ثماني لا تُعرض. قاعدة البيانات نفسها ترفضها، لا نحن فقط.',
    apply: 'قدّم كدار',
    checks: {
      owner_identity: { title: 'هويّة صاحب الدار', body: 'الهويّة والسجلات التجارية والقانونية.' },
      payout_ownership: { title: 'ملكية حساب الدفع', body: 'الحساب الذي يستلم المال تابع للدار نفسها.' },
      product_responsibility: { title: 'المسؤولية عن المنتج', body: 'من يصنعه أو يتحمّل مسؤوليته، ومستندات المنتج.' },
      labels_artwork: { title: 'الملصقات والتصميم', body: 'صور الملصقات والبيانات المطلوبة عليها.' },
      claims_evidence: { title: 'الادعاءات', body: 'دليل على كل ادعاء، أو يُحذف من الوصف.' },
      return_route: { title: 'طريق الإرجاع', body: 'خطوات وعنوان معروفان لأي عيب.' },
      service_capacity: { title: 'القدرة على التجهيز', body: 'طلب تجريبي كامل، والتزام بمدة التجهيز.' },
      privacy_contact: { title: 'مسؤول الخصوصية', body: 'شخص مسمّى مسؤول عن بياناتك.' },
    },

    recentIndex: '03',
    recentTitle: 'سُجّل حديثًا',
    selectedTitle: 'مختارة من السجل',
    fullRegister: (count: string) => `كل العطور (${count})`,
    family: 'العائلة',
    strength: 'التركيز',
    reviewsCount: (count: string) => `(${count})`,
    noReviews: 'لا تقييمات بعد',

    notesIndex: '04',
    notesTitle: 'ابحث بالنفحة، لا بالماركة',
    searchFor: (note: string) => `ابحث عن العطور التي فيها ${note}`,

    housesIndex: '05',
    housesTitle: 'الدور',
    allHouses: 'كل الدور',

    empty: 'لم تُنشر أي عطور بعد. الدور الأولى قيد التوثيق.',
  },
  {
    kicker: 'No. 01 — The register of houses',
    headline: 'Every perfume,',
    headlineAccent: 'with its source.',
    lede: 'We register every Egyptian perfume house and describe every perfume the same way: its notes, its strength, and who measured how long it lasts — the house, our test, or the people who bought it.',
    browse: 'Browse the perfumes',
    howWeVerify: 'How we verify a house',

    specimen: 'Specimen',
    verifiedStamp: 'Verified',
    delivery: 'Delivery',
    listSeparator: ', ',
    arrives: (min: string, max: string) => `Arrives in ${min}–${max} days`,

    checksIndex: '02',
    checksTitle: 'Eight checks before a house can sell',
    checksNote: 'A house with seven of eight does not go live. The database refuses it, not just us.',
    apply: 'Apply as a house',
    checks: {
      owner_identity: { title: 'Owner identity', body: 'ID and business and legal records.' },
      payout_ownership: { title: 'Payout ownership', body: 'The account that is paid belongs to the house.' },
      product_responsibility: { title: 'Product responsibility', body: 'Who makes it or answers for it, and the documents that say so.' },
      labels_artwork: { title: 'Labels and artwork', body: 'Images of every label and the information it must carry.' },
      claims_evidence: { title: 'Claims', body: 'Evidence for every claim, or it comes out of the description.' },
      return_route: { title: 'Returns route', body: 'A named process and address for defects.' },
      service_capacity: { title: 'Service capacity', body: 'A full test order, and a committed preparation time.' },
      privacy_contact: { title: 'Privacy contact', body: 'A named person responsible for your data.' },
    },

    recentIndex: '03',
    recentTitle: 'Recently registered',
    selectedTitle: 'Selected from the register',
    fullRegister: (count: string) => `All perfumes (${count})`,
    family: 'Family',
    strength: 'Strength',
    reviewsCount: (count: string) => `(${count})`,
    noReviews: 'No reviews yet',

    notesIndex: '04',
    notesTitle: 'Search by the note, not the brand',
    searchFor: (note: string) => `Find perfumes with ${note}`,

    housesIndex: '05',
    housesTitle: 'The houses',
    allHouses: 'All houses',

    empty: 'No perfumes are published yet. The first houses are being verified.',
  },
);
