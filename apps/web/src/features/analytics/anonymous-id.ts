import 'server-only';
import { cookies } from 'next/headers';
import { ANONYMOUS_ID_PATTERN, newAnonymousId } from '@diyar/domain';

/**
 * Who a visitor is, as far as the funnel is concerned — WORK_PLAN 9.5, A-1.
 *
 * 24 random hex characters in a first-party cookie. It is not an account, it is
 * not derived from anything about the person, and it means nothing on any other
 * site. What it buys is the only question the pre-order funnel exists to answer:
 * did the visitor who looked at this perfume come back and buy it.
 *
 * `httpOnly`, so no script on the page can read it — including any third-party
 * script that ever ends up there. `sameSite: 'lax'`, so it survives arriving
 * from a link (which is how most visitors arrive) without riding along on
 * cross-site POSTs. `secure` outside development, because a cookie sent in clear
 * over a hotel network is a cookie somebody else can pin to a person.
 *
 * 180 days is the retention A-1 proposes, awaiting counsel — the same number
 * the purge uses, and stated in one place so the two cannot drift.
 *
 * ONLY CALLABLE FROM A SERVER ACTION. Next refuses `cookies().set()` while
 * rendering, and it is right to: a page that sets a cookie as a side effect of
 * being displayed cannot be cached, and this one is called from `record.ts`.
 */
const COOKIE = 'diyar.aid';

/** A-1: the cookie and the retention sweep use the same number, from here. */
export const ANONYMOUS_ID_DAYS = 180;

export async function anonymousId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;

  // Anything in a cookie is untrusted input: it survives deploys, it is editable
  // by hand, and an id of the wrong shape is refused by the database anyway.
  if (existing && ANONYMOUS_ID_PATTERN.test(existing)) return existing;

  const issued = newAnonymousId((count) => crypto.getRandomValues(new Uint8Array(count)));
  store.set(COOKIE, issued, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ANONYMOUS_ID_DAYS * 24 * 60 * 60,
  });
  return issued;
}
