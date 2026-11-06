'use client';

import { useRouter } from 'next/navigation';
import { localeHref } from '@/core/href';
import { useState } from 'react';
import { Field } from '@/features/checkout/Field';
import { requestSellerCode, verifySellerCode } from './actions';
import { PrimaryButton } from '@/features/shell/PrimaryButton';
import { useSellerOperationalCopy } from './operational-copy';

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
  const { locale, t, errorText } = useSellerOperationalCopy();
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
      setError(t("Connection failed. Please try again."));
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
        router.push(localeHref(locale, '/seller/overview'));
        return;
      }
      setError(result.message);
    } catch {
      setError(t("Connection failed. Please try again."));
    }
    setBusy(false);
  };

  return (
    <form onSubmit={step === 'phone' ? submitPhone : submitCode} noValidate className="px-5 lg:px-0">
      {step === 'phone' ? (
        <>
          <p className="mb-7 max-w-proseMax text-small leading-relaxed text-ink2 lg:text-bodyLg">
             {t("Sign in using your house registered mobile number.")} </p>
          <Field
            label={t("Mobile number")} value={phone} onChange={setPhone} required
            type="tel" inputMode="tel" autoComplete="tel" maxLength={14}
          />
        </>
      ) : (
        <>
          <p className="mb-7 max-w-proseMax text-small leading-relaxed text-ink2 lg:text-bodyLg">
             {t("We sent a")} <span className="tnum"> {t("6")} </span>  {t("digit code to")} {' '}
            <span className="tnum latin">{phone}</span>.
          </p>
          <Field
            label={t("Verification code")} value={code} onChange={setCode} required
            inputMode="numeric" maxLength={6} autoComplete="one-time-code"
          />
          <button
            type="button"
            onClick={() => { setStep('phone'); setCode(''); setError(null); }}
            className="tappable mb-6 text-small text-ink2 underline transition-colors duration-base ease-out hover:text-accent"
          >
             {t("Change number")} </button>
        </>
      )}

      {error && (
        <p role="alert" className="mb-5 border border-danger bg-raised p-4 text-small leading-relaxed text-ink">
          {errorText(error)}
        </p>
      )}

      <PrimaryButton type="submit" disabled={busy} fill="full">
      {busy ? '…' : step === 'phone' ? t("Send code") : t("Sign in")}
    </PrimaryButton>

      {/*
        The stub, named on screen. A developer who cannot find the code wastes
        ten minutes; worse, someone could conclude sign-in is broken. This line
        disappears with the stub because it is rendered from the same flag the
        production guard reads.
      */}
      <p className="mt-5 text-center text-small leading-relaxed text-ink3">
         {t("Development mode: the code is printed in the server log instead of being sent by SMS.")} </p>
    </form>
  );
}
