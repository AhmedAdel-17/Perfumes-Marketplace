/**
 * Arabic copy.
 *
 * D-3 is open: launch language is undecided. The interim position is to build
 * the copy layer so a second locale is possible, and implement Arabic only.
 * Every user-visible string lives here so adding `en.ts` is a translation job,
 * not a refactor.
 */
export const ar = {
  common: {
    currency: 'جنيه',
    back: 'رجوع',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    continue: 'متابعة',
    edit: 'تعديل',
    retry: 'حاول مرّة أخرى',
  },
  cart: {
    title: 'الحقيبة',
    empty: 'حقيبتك فارغة',
    emptyBody: 'اختر من بين دور العطور المصرية، وستجد ما اخترته هنا.',
    browse: 'تصفّح الدور',
    products: 'المنتجات',
    shipping: 'الشحن',
    total: 'الإجمالي',
    checkout: 'متابعة الشراء',
    noHiddenFees: 'لا توجد رسوم إضافية عند الدفع',
    /** The multi-seller framing: authenticity, not fragmentation. */
    eachHouseShips: 'كل دار تشحن طلبها بنفسها.',
    eachHouseShipsBody: 'لذلك ترى عدة شحنات ومواعيد وصول — ولا ندمج التكلفة أو نخفيها.',
  },
  checkout: {
    contact: 'بيانات التواصل',
    address: 'عنوان التوصيل',
    delivery: 'الشحنات',
    payment: 'طريقة الدفع',
    review: 'المراجعة',
    phoneHint: 'سنرسل رمز تأكيد، ونستخدم الرقم نفسه للتتبّع والتواصل مع الدور.',
    landmarkHint: 'يساعد المندوب على الوصول دون اتصال — ويقلّل محاولات التسليم الفاشلة.',
    cod: 'الدفع عند الاستلام',
    codBody: 'تدفع نقدًا للمندوب عند تسليم كل شحنة',
    card: 'بطاقة بنكية',
    wallet: 'محفظة إلكترونية',
    noSubsidy: 'لا ندمج الشحنات ولا ندعم تكلفتها.',
    noSubsidyBody: 'السعر الذي تراه هو تكلفة الشحن الفعلية من كل دار.',
    placeOrder: 'تأكيد الطلب',
  },
  order: {
    title: 'الطلب',
    myOrders: 'طلباتي',
    inProgress: 'قيد التنفيذ',
    completed: 'اكتمل',
    partial: 'اكتمل جزئيًا',
    awaitingSeller: 'في انتظار تأكيد الدار',
    confirmed: 'تم التأكيد',
    dispatched: 'في الطريق إليك',
    delivered: 'تم التسليم',
    refused: 'رُفض الاستلام',
    returned: 'مُرتجع',
    rejected: 'اعتذرت الدار',
    track: 'تتبّع',
    /** Doc 06: the platform owns the experience even when the house fails. */
    weHandleIt: 'إن تأخّرت أي دار عن التأكيد، نتواصل معك ونتولّى الأمر.',
    yourOrderOurResponsibility: 'طلبك مسؤوليتنا، لا مسؤولية الدار وحدها.',
    noCharge: 'لن تدفع شيئًا عن هذه الشحنة.',
  },
  review: {
    title: 'التقييم',
    prompt: 'كيف كانت التجربة؟',
    verified: 'تقييمك موثّق بالشراء — يظهر للمشترين وللدار، ولا تستطيع الدار حذفه.',
    scent: 'الرائحة',
    longevity: 'الثبات',
    projection: 'الانتشار',
    value: 'القيمة مقابل السعر',
    packaging: 'التغليف',
    descriptionAccuracy: 'مطابقة الوصف',
    submit: 'أرسل التقييم',
  },
  seller: {
    apply: 'قدّم دارك',
    applyBody: 'نراجع كل طلب يدويًا. نختار عددًا محدودًا من الدور، لأن تجربة سيّئة واحدة تضرّ السوق كلّه.',
    verification: 'التوثيق',
    orders: 'الطلبات',
    confirm: 'أكّد الطلب',
    decline: 'اعتذر',
    statement: 'كشف الحساب',
    yourNet: 'صافيك',
    platformFee: 'عمولة المنصّة',
    /** The line that makes the asymmetric rate feel like fairness. */
    fromYourStorefront: 'هذا الطلب جاء من رابط متجرك، لذلك العمولة أقل.',
    weDontChargeForDemandWeDidntCreate: 'لا نحاسبك على طلب لم نصنع طلبه.',
  },
  errors: {
    generic: 'حدث خطأ. حاول مرّة أخرى.',
    network: 'تعذّر الاتصال. تحقّق من الشبكة.',
    outOfStock: 'نفد المخزون',
    slaBreached: 'انتهت مهلة التأكيد',
  },
} as const;

export type Dictionary = typeof ar;
