'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field } from '@/features/checkout/Field';
import { requestOpsCode, verifyOpsCode } from './actions';
import { PrimaryButton } from '@/features/shell/PrimaryButton';

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

  /*
    Every path clears `busy` and every failure says something.

    Both forms used to call the server action bare: an exception propagated out
    of the handler, `setBusy(false)` never ran, and the button stayed disabled
    with no message. The form was dead and looked merely slow — the worst
    failure state a sign-in can have, because the person keeps pressing.

    Found when the ops action threw on a schema problem: the screen showed
    nothing at all, and the bug looked like a missing step rather than a crash.
  */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      if (step === 'phone') {
        const result = await requestOpsCode(phone);
        if (result.ok) setStep('code');
        else setError(result.message);
        setBusy(false);
        return;
      }

      const result = await verifyOpsCode(phone, code);
      if (result.ok) {
        router.push('/ops/queue');
        return;                                  // navigation follows; stay busy
      }
      setError(result.message);
    } catch {
      setError('تعذّر الاتصال. حاول مرّة أخرى.');
    }
    setBusy(false);
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
        <p role="alert" className="mb-5 border border-danger bg-raised p-4 text-small text-ink">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={busy} fill="full">
      {busy ? '…' : step === 'phone' ? 'إرسال الرمز' : 'دخول'}
    </PrimaryButton>

      <p className="mt-5 text-center text-small leading-relaxed text-ink3">
        وضع التطوير: يُطبع الرمز في سجلّ الخادم.
      </p>
    </form>
  );
}
