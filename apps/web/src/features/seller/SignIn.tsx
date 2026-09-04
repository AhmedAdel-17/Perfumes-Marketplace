'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field } from '@/features/checkout/Field';
import { requestSellerCode, verifySellerCode } from './actions';

/**
 * House sign-in.
 *
 * Two steps, because the second genuinely gates on the first — unlike checkout,
 * where splitting a form into a wizard only adds places to give up.
 *
 * The phone step ALWAYS reports success, whether or not the number belongs to a
 * house. A truthful "no account with that number" is friendlier and it hands
 * anyone who asks a way to enumerate which numbers are sellers, one request at
 * a time. The code simply never arrives.
 */
export function SellerSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    Every path clears `busy` and every failure says something.

    Both forms used to call the server action bare: an exception propagated out
    of the handler, `setBusy(false)` never ran, and the button stayed disabled
    with no message. The form was dead and looked merely slow — the worst
    failure state a sign-in can have, because the person keeps pressing.

    Found when the ops action threw on a schema problem: the screen showed
    nothing at all, and the bug looked like a missing step rather than a crash.
  */
  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestSellerCode(phone);
      if (result.ok) setStep('code');
      else setError(result.message);
    } catch {
      setError('تعذّر الاتصال. حاول مرّة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifySellerCode(phone, code);
      if (result.ok) {
        // Deliberately leaves `busy` set: the navigation is the next thing that
        // happens, and re-enabling the button during it invites a second
        // submit against a code that has already been spent.
        router.push('/seller/orders');
        return;
      }
      setError(result.message);
    } catch {
      setError('تعذّر الاتصال. حاول مرّة أخرى.');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={step === 'phone' ? submitPhone : submitCode} noValidate className="px-5 lg:px-0">
      {step === 'phone' ? (
        <>
          <p className="mb-7 max-w-proseMax text-small leading-relaxed text-dim lg:text-bodyLg">
            سجّل الدخول برقم موبايل الدار المسجّل لدينا.
          </p>
          <Field
            label="رقم الموبايل" value={phone} onChange={setPhone} required
            type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
          />
        </>
      ) : (
        <>
          <p className="mb-7 max-w-proseMax text-small leading-relaxed text-dim lg:text-bodyLg">
            أرسلنا رمزًا مكوّنًا من <span className="tnum">٦</span> أرقام إلى{' '}
            <span className="tnum latin">{phone}</span>.
          </p>
          <Field
            label="رمز التحقّق" value={code} onChange={setCode} required
            inputMode="numeric" maxLength={6} autoComplete="one-time-code"
          />
          <button
            type="button"
            onClick={() => { setStep('phone'); setCode(''); setError(null); }}
            className="tappable mb-6 text-caption text-dim underline transition-colors duration-base ease-out hover:text-brass"
          >
            تغيير الرقم
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mb-5 border border-[#B5697E]/50 bg-l1 p-4 text-small leading-relaxed text-bone">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="relative flex h-control w-full items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 active:opacity-press disabled:opacity-disabled disabled:brightness-75"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
        {busy ? '…' : step === 'phone' ? 'إرسال الرمز' : 'دخول'}
      </button>

      {/*
        The stub, named on screen. A developer who cannot find the code wastes
        ten minutes; worse, someone could conclude sign-in is broken. This line
        disappears with the stub because it is rendered from the same flag the
        production guard reads.
      */}
      <p className="mt-5 text-center text-micro leading-relaxed text-faint">
        وضع التطوير: يُطبع الرمز في سجلّ الخادم بدل إرساله برسالة.
      </p>
    </form>
  );
}
