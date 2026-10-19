// The three seeded perfumes, as the catalogue holds them (apps/web/scripts/seed.ts
// and seed-english.ts), plus what the prototypes derive from their photographs.
const MEDIA = '../../apps/web/scripts/mock-photos';

// The note drawings, from packages/ui/src/icons.tsx (the glossary's icon keys).
export const ICONS = {
  bergamot: '<circle cx="12" cy="13" r="7"/><path d="M12 6V4M12 6c-1.6 0-2.6-1-2.6-1M12 6c1.6 0 2.6-1 2.6-1"/><path d="M12 6v14M5.2 10.5l13.6 5M5.2 15.5l13.6-5"/>',
  citrus: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7"/>',
  cardamom: '<path d="M12 20V9.5"/><path d="M12 9.5C9 9.5 6.5 7 6.5 4 9.5 4 12 6.5 12 9.5z"/><path d="M12 13c3 0 5.5-2.5 5.5-5.5C14.5 7.5 12 10 12 13z"/>',
  saffron: '<path d="M6 15c0-4 2.7-7 6-7s6 3 6 7"/><path d="M9 8.5c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5"/><path d="M4.5 15h15v1.5a3 3 0 01-3 3h-9a3 3 0 01-3-3z"/>',
  jasmine: '<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6c0-2.8-1.9-5-.1-5.4 1.9-.4 2 2.6.1 5.4z"/><path d="M14.4 12c2.8 0 5-1.9 5.4-.1.4 1.9-2.6 2-5.4.1z"/><path d="M12 14.4c0 2.8 1.9 5 .1 5.4-1.9.4-2-2.6-.1-5.4z"/><path d="M9.6 12c-2.8 0-5 1.9-5.4.1-.4-1.9 2.6-2 5.4-.1z"/>',
  white_flower: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1-4.5 0-4.5S12 7 12 10M14 12c3 0 4.5 1 4.5 0S17 12 14 12M12 14c0 3-1 4.5 0 4.5s0-1.5 0-4.5M10 12c-3 0-4.5-1-4.5 0S7 12 10 12"/>',
  rose: '<path d="M12 20v-5"/><circle cx="12" cy="10" r="5.5"/><path d="M12 10c0-2 1.4-3.4 3.2-3.4M12 10c0 2-1.4 3.4-3.2 3.4M12 10c-2 0-3.4-1.4-3.4-3.2"/>',
  wood: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/><path d="M12 4v3.2"/>',
  palm: '<path d="M12.4 21c.5-3.6.3-6.9-.8-9.8"/><path d="M11.6 11.2C9.4 8.6 6.4 8 3.8 9.4"/><path d="M11.6 11.2c-.4-3.2-2.4-5.6-5.2-6.6"/><path d="M11.6 11.2c1.2-3.1 3.8-4.9 6.8-4.9"/><path d="M11.6 11.2c2.9-1 5.8-.2 7.8 2"/>',
  sprig: '<path d="M12 21V4.5"/><path d="M12 8.5c-2.2 0-3.8-1.6-3.8-3.8 2.2 0 3.8 1.6 3.8 3.8z"/><path d="M12 8.5c2.2 0 3.8-1.6 3.8-3.8-2.2 0-3.8 1.6-3.8 3.8z"/><path d="M12 14.5c-2.7 0-4.6-1.9-4.6-4.6 2.7 0 4.6 1.9 4.6 4.6z"/><path d="M12 14.5c2.7 0 4.6-1.9 4.6-4.6-2.7 0-4.6 1.9-4.6 4.6z"/>',
  leaf: '<path d="M12 20V9"/><path d="M12 12.5c-3.2 0-5.5-2.4-5.5-5.5C9.7 7 12 9.4 12 12.5z"/><path d="M12 15c3.2 0 5.5-2.4 5.5-5.5C14.3 9.5 12 11.9 12 15z"/>',
  oud: '<path d="M5 19c0-6 3-14 7-14s7 8 7 14z"/><path d="M8.4 19c.3-4.4 1.8-9.6 3.6-9.6s3.3 5.2 3.6 9.6"/>',
  amber: '<path d="M12 3.5c2.8 3.8 4.6 6.8 4.6 9.6a4.6 4.6 0 11-9.2 0c0-2.8 1.8-5.8 4.6-9.6z"/>',
  musk: '<path d="M4.5 16c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 4.8 0"/><path d="M4.5 11.5c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 4.8 0"/><path d="M4.5 7c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 4.8 0"/>',
};
export const icon = (key) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[key] ?? '<path d="M12 7l5 5-5 5-5-5z"/>'}</svg>`;

// The scent-family tokens, and a lighter "mist" of each for the dark stage.
export const FAMILY = {
  amber: { ar: 'عنبر', en: 'Amber', colour: '#A8681F', mist: '#F0B35E' },
  floral: { ar: 'زهري', en: 'Floral', colour: '#C07A90', mist: '#EBA7C0' },
  fresh: { ar: 'منعش', en: 'Fresh', colour: '#5A8C7C', mist: '#93D3BD' },
  oud: { ar: 'عود', en: 'Oud', colour: '#4A3328', mist: '#B98466' },
  woody: { ar: 'خشبي', en: 'Woody', colour: '#7A5C3E', mist: '#C9A27A' },
  gourmand: { ar: 'حلواني', en: 'Gourmand', colour: '#9A6B4A', mist: '#D8A57F' },
  musk: { ar: 'مسك', en: 'Musk', colour: '#8E8578', mist: '#CFC6B8' },
};

const n = (ar, en, iconKey) => ({ ar, en, icon: iconKey });

export const PERFUMES = [
  {
    slug: 'layl-al-qahira', name: 'ليل القاهرة', nameEn: 'Cairo Night',
    house: 'ميزون نور', houseEn: 'Maison Nour', city: 'القاهرة', founded: 2019,
    family: 'amber', concentration: 'أو دو بارفان', ml: 50, price: 450,
    longevity: { band: 'very_long', ar: 'طويل جدًا', segments: 4 },
    projection: { band: 'strong', ar: 'قوي', segments: 3 },
    photo: `${MEDIA}/layl-al-qahira.jpg`,
    cutout: `${MEDIA}/derived/layl-al-qahira-cutout.png`,
    height: `${MEDIA}/derived/layl-al-qahira-height.png`,
    // From the pipeline (derived/placements.json): where the cut-out sat in the photo.
    placement: { centre: [0.4716, 0.4922], height: 0.688, angle: 28.1 },
    notes: {
      top: [n('برغموت', 'Bergamot', 'bergamot'), n('زعفران', 'Saffron', 'saffron'), n('هيل', 'Cardamom', 'cardamom')],
      heart: [n('ورد دمشقي', 'Damask rose', 'rose'), n('ياسمين', 'Jasmine', 'jasmine')],
      base: [n('عود', 'Oud', 'oud'), n('عنبر', 'Amber', 'amber'), n('مسك', 'Musk', 'musk')],
    },
  },
  {
    slug: 'ward-al-taif', name: 'ورد الطائف', nameEn: 'Taif Rose',
    house: 'دار الورد', houseEn: 'Dar Al Ward', city: 'الإسكندرية', founded: 2021,
    family: 'floral', concentration: 'أو دو بارفان', ml: 30, price: 380,
    longevity: { band: 'long', ar: 'طويل', segments: 3 },
    projection: { band: 'moderate', ar: 'متوسط', segments: 2 },
    photo: `${MEDIA}/ward-al-taif.jpg`,
    cutout: `${MEDIA}/derived/ward-al-taif-cutout.png`,
    height: `${MEDIA}/derived/ward-al-taif-height.png`,
    placement: { centre: [0.534, 0.5728], height: 0.4432, angle: 0 },
    notes: {
      top: [n('برغموت', 'Bergamot', 'bergamot'), n('ليمون', 'Lemon', 'citrus')],
      heart: [n('ورد طائفي', 'Taif rose', 'rose'), n('ياسمين', 'Jasmine', 'jasmine'), n('إيلنغ', 'Ylang-ylang', 'white_flower')],
      base: [n('مسك', 'Musk', 'musk'), n('خشب الصندل', 'Sandalwood', 'wood')],
    },
  },
  {
    slug: 'nakhil', name: 'نخيل', nameEn: 'Palms of Siwa',
    house: 'أتيليه سيوة', houseEn: 'Atelier Siwa', city: 'الجيزة', founded: 2020,
    family: 'fresh', concentration: 'أو دو تواليت', ml: 50, price: 290,
    longevity: { band: 'moderate', ar: 'متوسط', segments: 2 },
    projection: { band: 'intimate', ar: 'قريب', segments: 1 },
    photo: `${MEDIA}/nakhil.jpg`,
    cutout: `${MEDIA}/derived/nakhil-cutout.png`,
    height: `${MEDIA}/derived/nakhil-height.png`,
    placement: { centre: [0.489, 0.6594], height: 0.4, angle: -45.73 },
    notes: {
      top: [n('نعناع', 'Mint', 'sprig'), n('ليمون أخضر', 'Lime', 'citrus')],
      heart: [n('نخيل', 'Palm', 'palm'), n('شاي أخضر', 'Green tea', 'leaf')],
      base: [n('مسك أبيض', 'White musk', 'musk'), n('خشب الأرز', 'Cedarwood', 'wood')],
    },
  },
];

export const TIERS = [
  { key: 'top', ar: 'القمة', en: 'Top', when: 'أول نصف ساعة' },
  { key: 'heart', ar: 'القلب', en: 'Heart', when: 'من ساعة إلى أربع' },
  { key: 'base', ar: 'القاعدة', en: 'Base', when: 'حتى آخر اليوم' },
];

// The motion curves of tokens.json, as functions of t in [0, 1].
const bezier = (x1, y1, x2, y2) => (t) => {
  // Newton-Raphson on x, then y — the same curve CSS draws.
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3 - t;
    const dx = 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - x / dx));
  }
  return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
};
export const EASE = { out: bezier(0.16, 1, 0.3, 1), inOut: bezier(0.65, 0, 0.35, 1), entrance: bezier(0.22, 1, 0.36, 1) };
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
