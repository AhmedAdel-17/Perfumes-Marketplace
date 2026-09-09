'use client';

import { useState } from 'react';
import { APPLICATION_NOTE_MAX, houseSlug } from '@diyar/domain';
import { Field } from '@/features/checkout/Field';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { submitApplication } from './actions';

/**
 * A house applying to join.
 *
 * IT ASKS FOR ALMOST NOTHING, and that is the design. The eight verification
 * controls are the real gate and they are worked through with a person
 * afterwards; a form that demanded a commercial register, a tax card and label
 * artwork up front would filter out exactly the small makers this marketplace
 * exists for.
 *
 * THE STOREFRONT ADDRESS IS SHOWN AS IT IS TYPED. The Latin wordmark becomes a
 * permanent URL that the house will print on its packaging, and a maker who
 * only discovers what it became after approval has been given something they
 * did not choose.
 */
export function ApplyForm() {
  const [tradingName, setTradingName] = useState('');
  const [latinName, setLatinName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Computed by the DOMAIN's function — the same one the router uses to build
  // the real slug. A preview drawn by a second implementation would eventually
  // promise an address the server does not create.
  const slug = houseSlug(latinName);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError(null);
    const result = await submitApplication({
      tradingName, latinName, ownerName, contactPhone: phone,
      contactEmail: email, city, note,
    });
    setSending(false);

    if (result.ok) setSent(true);
    else setError(result.message);
  };

  if (sent) {
    return (
      <div className="px-5 lg:px-0">
        <div className="border border-line bg-raised p-5">
          <h2 className="font-display text-h3">وصلنا طلبك</h2>
          <p className="mt-3 max-w-proseMax text-small leading-relaxed text-ink2">
            سنراجعه ونتصل بك على <span className="latin tnum">{phone}</span> خلال
            أسبوع. المراجعة ثمانية بنود — هويّة المسؤول، ملكية حساب التحويل،
            المسؤولية عن المنتج، الملصقات، إثبات ما يُذكر في الوصف، طريق الإرجاع،
            القدرة على التجهيز، ومسؤول الخصوصية — ونمرّ عليها معك.
          </p>
          <p className="mt-3 text-caption leading-relaxed text-ink3">
            لا نطلب أي رسوم للانضمام، ولا ندخل الدار للبيع قبل انتهاء المراجعة.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="px-5 lg:px-0">
      <Field label="اسم الدار" value={tradingName} onChange={setTradingName} required maxLength={120} />

      <Field
        label="الاسم بالحروف اللاتينية"
        value={latinName}
        onChange={setLatinName}
        required
        maxLength={120}
        hint="كما يظهر على الزجاجة — منه يُبنى عنوان متجرك"
      />

      {/*
        The address, as it is being typed. It is permanent and it goes on the
        packaging, so a maker should see it before they send the form rather
        than after we have approved them.
      */}
      {slug.length > 0 && (
        <p className="-mt-3 mb-5 text-caption text-ink3">
          عنوان متجرك سيكون{' '}
          <span className="latin select-all text-ink2">diyar.eg/house/{slug}</span>
        </p>
      )}

      <Field label="اسم المسؤول" value={ownerName} onChange={setOwnerName} required maxLength={120} />
      <Field
        label="رقم الموبايل" value={phone} onChange={setPhone} required
        type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
      />
      <Field
        label="البريد الإلكتروني" value={email} onChange={setEmail}
        maxLength={160} hint="اختياري"
      />
      <Field label="المدينة" value={city} onChange={setCity} required maxLength={80} />

      <label className="mb-5 block">
        <span className="text-caption tracking-label text-ink3">عن دارك</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, APPLICATION_NOTE_MAX))}
          rows={6}
          maxLength={APPLICATION_NOTE_MAX}
          required
          className="mt-2 block w-full resize-y border border-line bg-raised p-3 text-small leading-relaxed text-ink outline-none transition-colors duration-base ease-out focus-visible:border-accent"
        />
        <span className="mt-1 block text-micro leading-relaxed text-ink3">
          ماذا تصنع، ومنذ متى، وكم زجاجة في الشهر تقريبًا. فقرة تكفي.
        </span>
        <span dir="ltr" className="tnum mt-1 block text-end text-micro text-ink3">
          {note.length}/{APPLICATION_NOTE_MAX}
        </span>
      </label>

      {error && (
        <p role="alert" className="mb-5 border border-line bg-raised p-4 text-small leading-relaxed text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={sending} fill="full">
        {sending ? '…جارٍ الإرسال' : 'أرسل الطلب'}
      </PrimaryButton>
    </form>
  );
}
