/**
 * Site-wide announcements.
 *
 * One short line, shown on every screen, for a bounded window. It is the only
 * content in this system that is not reviewed before it goes up, because its
 * whole purpose is urgency and a notice that waits for a second approver is a
 * notice that arrives after the delay it was warning about.
 *
 * The safeguards are different in kind rather than absent: it is one line, it
 * carries no markup, it is attributable, and it expires by itself. That last
 * one is the load-bearing part — an announcement that has to be taken down by
 * hand is an announcement still apologising for last Eid in November.
 */
import { InvalidTransition } from '../errors/index';

/** Longer than this stops being a notice and starts pushing the shop down. */
export const ANNOUNCEMENT_MAX_LENGTH = 160;

/**
 * Ninety days.
 *
 * Not a technical limit — a definitional one. Something true for longer than a
 * season is not news, it is a fact about the marketplace, and facts belong on a
 * page where they can be read in context rather than in a bar that every
 * visitor learns to skip.
 */
export const ANNOUNCEMENT_MAX_DAYS = 90;

export interface Announcement {
  readonly id: string;
  readonly message: string;
  readonly href: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export type WindowObjection =
  | 'empty_message'
  | 'message_too_long'
  | 'ends_before_it_starts'
  | 'window_too_long'
  | 'already_over';

/**
 * Whether a proposed announcement can be posted, and every reason it cannot.
 *
 * All of them, not the first — the same rule the page editor follows, and for
 * the same reason: someone who fixes one fault and is immediately shown the
 * next stops trusting the form.
 */
export function objectionsToPosting(
  input: { message: string; startsAt: Date; endsAt: Date },
  now: Date,
): WindowObjection[] {
  const objections: WindowObjection[] = [];
  const message = input.message.trim();

  if (message.length === 0) objections.push('empty_message');
  if (message.length > ANNOUNCEMENT_MAX_LENGTH) objections.push('message_too_long');

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    objections.push('ends_before_it_starts');
  } else {
    const days = (input.endsAt.getTime() - input.startsAt.getTime()) / 86_400_000;
    if (days > ANNOUNCEMENT_MAX_DAYS) objections.push('window_too_long');
  }

  /*
   * A window that has already closed.
   *
   * Not the same as "starts in the past": scheduling one to have begun an hour
   * ago is a normal thing to do when you are late. One that ENDED before it was
   * written is a typo in the year, and posting it silently produces an
   * announcement nobody will ever see and nobody will think to look for.
   */
  if (input.endsAt.getTime() <= now.getTime()) objections.push('already_over');

  return objections;
}

/**
 * The one to show, out of everything scheduled.
 *
 * Overlaps are allowed and are not a mistake: Ramadan hours and a delivery
 * delay can both be true, and forbidding the overlap would mean an operator
 * deleting one to post the other and forgetting to put it back. So the rule is
 * MOST RECENTLY BEGUN WINS — the newer situation is the one a visitor needs,
 * and it is the rule an operator can predict without reading this file.
 *
 * Returns null when nothing is in window, which is the normal state. A site
 * with a permanent bar is a site whose bar is invisible.
 */
export function showing(
  announcements: readonly Announcement[],
  now: Date,
): Announcement | null {
  const live = announcements.filter(
    (a) => now.getTime() >= a.startsAt.getTime() && now.getTime() < a.endsAt.getTime(),
  );
  if (live.length === 0) return null;

  return live.reduce((latest, candidate) => (
    candidate.startsAt.getTime() > latest.startsAt.getTime() ? candidate : latest
  ));
}

/**
 * Take one down before its window ends.
 *
 * Ending it NOW rather than deleting the row: what the site said, and when, is
 * a thing somebody will eventually need to answer for — most likely the time it
 * said something wrong. Deletion answers that question with silence.
 */
export function endedNow(announcement: Announcement, now: Date): Announcement {
  if (now.getTime() < announcement.startsAt.getTime()) {
    // Not started yet. Ending it "now" would leave `ends_at` before `starts_at`
    // and violate the database's own ordering CHECK — a caller has to withdraw
    // it instead, which is a different act with a different name.
    throw new InvalidTransition('scheduled', 'ended', 'announcement');
  }
  return { ...announcement, endsAt: now };
}
