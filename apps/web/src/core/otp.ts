import 'server-only';
import { appendFileSync } from 'node:fs';
import { consoleOtpSender, outboxOtpSender, type OtpSender } from '@diyar/api';

/**
 * Which one-time-code sender this process uses — the composition root for it.
 *
 * Both choices are declared STUBS, and `instrumentation-node.ts` hands the same
 * instance to `assertProductionSafe`, so neither can reach production. The real
 * SMS sender replaces this function's body when a vendor is chosen (ADR-11,
 * P1.1.1), and no call site changes.
 *
 * `OTP_OUTBOX`, when set, is a file the browser suites read codes from
 * (P3.4.3) — the test hook that replaced scraping the dev server's log. Unset,
 * codes are only printed, which is all a person running the app needs.
 */
let sender: OtpSender | null = null;

export function otpSender(): OtpSender {
  if (sender) return sender;
  const outbox = process.env.OTP_OUTBOX;
  sender = outbox
    ? outboxOtpSender((line) => appendFileSync(outbox, `${line}\n`))
    : consoleOtpSender;
  return sender;
}
