import { defineMessages } from '../messages';

/** The return request, on the tracking screen. */
export const RETURNS = defineMessages(
  {
    heading: 'إرجاع منتج',
    refunded: 'المبلغ المردود',
    houseReviews: 'الدار هي من تراجع الطلب. لن يُردّ أي مبلغ قبل أن تصل العبوة إلينا ونفحصها.',
    ml: 'مل',
    daysLeft: (days: string, _single: boolean) => `باقٍ ${days} يوم`,
    close: 'إغلاق',
    request: 'اطلب الإرجاع',
    whatIsWrong: 'ما المشكلة؟',
    explain: 'اشرح باختصار',
    houseReads: 'الدار ستقرأ هذا السطر قبل أن ترسل من يستلم العبوة.',
    sending: '…جارٍ الإرسال',
    send: 'أرسل طلب الإرجاع',
    chooseReason: 'اختر سبب الإرجاع.',
    writeLine: 'اكتب سطرًا يوضّح المشكلة.',
    failed: 'تعذّر إرسال طلب الإرجاع. حاول مرة أخرى.',
  },
  {
    heading: 'Return a product',
    refunded: 'Amount refunded',
    houseReviews: 'The house reviews the request. Nothing is refunded before the bottle reaches us and is inspected.',
    ml: 'ml',
    daysLeft: (days: string, single: boolean) => `${days} ${single ? 'day' : 'days'} left`,
    close: 'Close',
    request: 'Request a return',
    whatIsWrong: 'What is the problem?',
    explain: 'Explain briefly',
    houseReads: 'The house reads this line before sending someone to collect the bottle.',
    sending: 'Sending…',
    send: 'Send return request',
    chooseReason: 'Choose a reason for the return.',
    writeLine: 'Write a line explaining the problem.',
    failed: 'We could not send your return request. Please try again.',
  },
);
