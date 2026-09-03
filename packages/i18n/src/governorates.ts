import { GOVERNORATES, type Governorate } from '@diyar/domain';

/**
 * Governorate names in Arabic.
 *
 * The domain and the database both speak in stable English keys, because an
 * enum value that is also display text cannot be renamed without a migration
 * and cannot be translated at all. The Arabic lives here, in the copy layer,
 * where changing a name is a text edit.
 *
 * There are no postal codes anywhere in this system (CLAUDE.md §16): Egypt does
 * not use them, and a field for one invites a courier integration to depend on
 * it. Governorate → city → area → street is the whole address.
 */
export const GOVERNORATE_AR: Readonly<Record<Governorate, string>> = {
  cairo: 'القاهرة',
  giza: 'الجيزة',
  alexandria: 'الإسكندرية',
  qalyubia: 'القليوبية',
  sharqia: 'الشرقية',
  dakahlia: 'الدقهلية',
  beheira: 'البحيرة',
  gharbia: 'الغربية',
  monufia: 'المنوفية',
  kafr_el_sheikh: 'كفر الشيخ',
  damietta: 'دمياط',
  port_said: 'بورسعيد',
  ismailia: 'الإسماعيلية',
  suez: 'السويس',
  north_sinai: 'شمال سيناء',
  south_sinai: 'جنوب سيناء',
  beni_suef: 'بني سويف',
  faiyum: 'الفيوم',
  minya: 'المنيا',
  asyut: 'أسيوط',
  sohag: 'سوهاج',
  qena: 'قنا',
  luxor: 'الأقصر',
  aswan: 'أسوان',
  red_sea: 'البحر الأحمر',
  new_valley: 'الوادي الجديد',
  matrouh: 'مطروح',
};

/**
 * For a select, with the three that carry most of the volume first.
 *
 * Doc 02: Cairo, Giza and Alexandria are the launch cities. Sorting the whole
 * list alphabetically would be tidy and would put Aswan above Cairo, which
 * costs a scroll to the overwhelming majority of customers on a phone.
 */
const PRIORITY: readonly Governorate[] = ['cairo', 'giza', 'alexandria'];

export const GOVERNORATE_OPTIONS: ReadonlyArray<{ value: Governorate; label: string }> = [
  ...PRIORITY,
  ...GOVERNORATES.filter((g) => !PRIORITY.includes(g)),
].map((value) => ({ value, label: GOVERNORATE_AR[value] }));
