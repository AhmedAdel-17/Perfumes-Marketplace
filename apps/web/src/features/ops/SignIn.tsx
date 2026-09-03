'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field } from '@/features/checkout/Field';
import { requestOpsCode, verifyOpsCode } from './actions';

/**
 * Operator sign-in.
 *
 * Identical in shape to the seller's, deliberately: the threat is the same and
 * two mechanisms would mean two places to get session handling wrong. The
 * differences that matter are not visible here — a shorter session, a separate
 * cookie, a separate signing secret.
 */
export function OpsSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    if (step === 'phone') {
      const result = await requestOpsCode(phone);
      if (result.ok) setStep('code');
      else setError(result.message);
      setBusy(false);
      return;
    }

    const result = await verifyOpsCode(phone, code);
    if (result.ok) router.push('/ops/queue');
    else {
      setError(result.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="px-5 lg:px-0">
      {step === 'phone' ? (
        <Field
          label="رقم الموبايل" value={phone} onChange={setPhone} required
          type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
        />
      ) : (
        <Field
          label="رمز التحقّق" value={code} onChange={setCode} required
          inputMode="numeric" maxLength={6} autoComplete="one-time-code"
        />
      )}

      {error && (
        <p role="alert" className="mb-5 border border-[#B5697E]/50 bg-l1 p-4 text-small text-bone">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="relative flex h-control w-full items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-bodyLg font-medium tracking-[1.2px] text-noir transition-[filter,opacity] duration-base ease-out hover:brightness-110 disabled:opacity-disabled"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-white/30" aria-hidden />
        {busy ? '…' : step === 'phone' ? 'إرسال الرمز' : 'دخول'}
      </button>

      <p className="mt-5 text-center text-micro leading-relaxed text-faint">
        وضع التطوير: يُطبع الرمز في سجلّ الخادم.
      </p>
    </form>
  );
}
