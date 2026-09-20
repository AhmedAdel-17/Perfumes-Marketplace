# Brand voice

## 1. Voice principles

1. **Say the fact, then the feeling.** "يصل خلال ٣ إلى ٤ أيام" before any adjective.
2. **Name the source.** A performance band says who measured it; a fee says who receives it.
3. **Answer "what now".** Every state message ends with the next thing that happens.
4. **Address a person.** Second person singular, courteous, Egyptian-neutral Modern
   Standard Arabic with everyday words; no dialect slang in the interface, no classical
   flourish.
5. **Count correctly.** Six plural forms through `counted()` (FACT, enforced).
6. **Never shout.** No exclamation marks, no capitals in Latin labels beyond small caps, no
   urgency.

## 2. Arabic voice (primary)

- Register: فصحى مبسّطة — the Arabic of a good newspaper feature, not a legal notice and
  not a chat.
- Direct address: **أنت** implied; verbs in second person; avoid passive where a person
  acts ("أكّدت الدار طلبك", not "تم تأكيد الطلب" — except in system logs).
- Houses are **دور** (singular دار); perfumes are **عطور**; a listing is **عطر** not "منتج"
  where possible; the customer is **أنت**, never "العميل" on screen.
- Numbers: Western digits for data (prices, phones, references), Arabic-Indic for editorial
  counts — the documented rule (FACT).
- Latin inside Arabic (house wordmarks, EGP, notes in Latin) isolated with bidi isolation
  (FACT practice).

## 3. English voice (secondary; D-3 open)

Used today only for Latin labels (small caps: MAISON NOUR, EGP, TOP · HEART · BASE) and
for investor/partner material. If English becomes a full locale: British spelling, same
principles, no marketing adjectives, product names untranslated, "house" for دار,
"perfume" for عطر, never "fragrance brand" for a house.

## 4. Tone by audience

| Audience | Tone | Example (Arabic, working) |
|---|---|---|
| Customer, browsing | editorial, precise | «عود وعنبر من دار ميزون نور. ثبات طويل — بحسب متوسط تقييمات المشترين.» |
| Customer, buying | plain, reassuring, exact | «تدفع ٤٣٥ جنيهًا نقدًا للمندوب عند التسليم. الشحنة من دار الورد، تصل خلال ٣ إلى ٤ أيام.» |
| Customer, something went wrong | responsible, concrete | «تأخر طلبك عن الموعد. تواصلنا مع الدار، وسنخبرك خلال اليوم بما سيحدث.» |
| Seller, operational | respectful, exact | «طلب جديد. أكّد قبل الساعة ١٨:٠٠ غدًا.» |
| Seller, money | itemised, neutral | «مستحقاتك عن الفترة: ١٢ طلبًا مكتملًا، عمولة ٥٪ على ٩ منها و١٥٪ على ٣. مهلة الاعتراض تنتهي في…» |
| Seller, enforcement | firm, factual, with a path | «نسبة التأكيد في الوقت ٧٨٪ في آخر ٣٠ يومًا؛ الحد ٩٠٪. خطة المعالجة: …» |
| Ops console | terse | «متأخر ٣ س · لم تُسلَّم النقدية · ٢ تذكرة P1» |

## 5. Trust language — approved forms and forbidden forms

| Say | Not |
|---|---|
| «دار موثّقة: تحقّقنا من هوية صاحبها ومسؤوليته عن المنتج وطريقة الإرجاع» | «موثوق ١٠٠٪» |
| «المصدر: بيانات الدار» / «متوسط تقييمات المشترين» / «اختبار المنصّة» | «ثبات مضمون» |
| «تقييم من مشترٍ استلم الطلب» | «تقييمات حقيقية» |
| «رسوم التوصيل ٥٥ جنيهًا لكل دار، تُدفع للدار التي تشحن» | «شحن مجاني*» |
| «يمكنك الإرجاع خلال ١٤ يومًا إذا كانت العبوة مغلقة» (after counsel) | «إرجاع سهل» |
| «مُروَّج» (sponsored, labelled) | unlabelled featured |

## 6. Words we do not use

عرض محدود · اشترِ الآن · لا تفوّت · أصلي ١٠٠٪ · الأفضل في مصر · مطابق لـ (designer name)
· خصم صادم · exclamation marks · emoji.

## 7. Where voice lives in the product (FACT)

All copy in `@diyar/i18n` (with a documented gap: some labels duplicated in the web app).
A voice review is part of the design checklist ("copy read aloud in Arabic — does it sound
like a house, or like a shop?", doctrine §4).
