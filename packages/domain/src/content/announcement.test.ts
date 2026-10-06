import { describe, expect, it } from 'vitest';
import { InvalidTransition } from '../errors/index';
import {
  ANNOUNCEMENT_MAX_DAYS, ANNOUNCEMENT_MAX_LENGTH, endedNow, objectionsToPosting, showing,
  type Announcement,
} from './announcement';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1',
  message: 'التوصيل متأخر بسبب العيد',
  messageEn: null,
  href: null,
  startsAt: hours(-1),
  endsAt: hours(24),
  ...over,
});

describe('what may be posted', () => {
  it('accepts a normal notice', () => {
    expect(objectionsToPosting(
      { message: 'التوصيل متأخر', startsAt: NOW, endsAt: days(3) }, NOW,
    )).toEqual([]);
  });

  it('accepts one that started an hour ago', () => {
    // Being late to post is normal. It is not the same fault as a window that
    // has already closed.
    expect(objectionsToPosting(
      { message: 'التوصيل متأخر', startsAt: hours(-1), endsAt: days(2) }, NOW,
    )).toEqual([]);
  });

  it('refuses an empty message', () => {
    expect(objectionsToPosting(
      { message: '   ', startsAt: NOW, endsAt: days(1) }, NOW,
    )).toContain('empty_message');
  });

  it('refuses a message longer than a notice', () => {
    expect(objectionsToPosting(
      { message: 'ا'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1), startsAt: NOW, endsAt: days(1) }, NOW,
    )).toContain('message_too_long');
  });

  it('refuses a window that ends before it starts', () => {
    expect(objectionsToPosting(
      { message: 'خبر', startsAt: days(2), endsAt: days(1) }, NOW,
    )).toContain('ends_before_it_starts');
  });

  it('refuses a window longer than a season', () => {
    // Something true for longer than this is a fact about the marketplace, not
    // news, and belongs on a page rather than in a bar people learn to skip.
    expect(objectionsToPosting(
      { message: 'خبر', startsAt: NOW, endsAt: days(ANNOUNCEMENT_MAX_DAYS + 1) }, NOW,
    )).toContain('window_too_long');
  });

  it('accepts a window exactly at the limit', () => {
    expect(objectionsToPosting(
      { message: 'خبر', startsAt: NOW, endsAt: days(ANNOUNCEMENT_MAX_DAYS) }, NOW,
    )).toEqual([]);
  });

  it('refuses one whose window has already closed', () => {
    // A typo in the year, posted silently, produces a notice nobody will ever
    // see and nobody will think to look for.
    expect(objectionsToPosting(
      { message: 'خبر', startsAt: days(-10), endsAt: days(-5) }, NOW,
    )).toContain('already_over');
  });

  it('reports every objection at once', () => {
    const objections = objectionsToPosting(
      { message: '', startsAt: days(2), endsAt: days(1) }, NOW,
    );
    expect(objections).toContain('empty_message');
    expect(objections).toContain('ends_before_it_starts');
  });
});

describe('which one shows', () => {
  it('shows nothing when nothing is in window', () => {
    // The normal state. A site with a permanent bar is a site whose bar is
    // invisible.
    expect(showing([announcement({ startsAt: days(1), endsAt: days(2) })], NOW)).toBeNull();
  });

  it('shows nothing when the list is empty', () => {
    expect(showing([], NOW)).toBeNull();
  });

  it('shows one that is in window', () => {
    expect(showing([announcement()], NOW)?.id).toBe('a1');
  });

  it('excludes one that has ended', () => {
    expect(showing([announcement({ endsAt: hours(-1) })], NOW)).toBeNull();
  });

  it('excludes one that has not started', () => {
    expect(showing([announcement({ startsAt: hours(1) })], NOW)).toBeNull();
  });

  it('treats the end instant as over, and the start instant as begun', () => {
    // Half-open, so a window ending at noon and one starting at noon do not
    // both show for the same millisecond.
    expect(showing([announcement({ startsAt: hours(-2), endsAt: NOW })], NOW)).toBeNull();
    expect(showing([announcement({ startsAt: NOW, endsAt: hours(2) })], NOW)?.id).toBe('a1');
  });

  it('shows the MOST RECENTLY BEGUN when two overlap', () => {
    /*
     * Overlaps are allowed on purpose. Ramadan hours and a delivery delay can
     * both be true, and forbidding the overlap would make an operator delete
     * one to post the other and forget to put it back.
     */
    const older = announcement({ id: 'ramadan', startsAt: days(-5), endsAt: days(5) });
    const newer = announcement({ id: 'delay', startsAt: hours(-2), endsAt: days(1) });
    expect(showing([older, newer], NOW)?.id).toBe('delay');
    // Order in the list must not matter.
    expect(showing([newer, older], NOW)?.id).toBe('delay');
  });

  it('ignores a newer one that is out of window', () => {
    const live = announcement({ id: 'live', startsAt: days(-1), endsAt: days(1) });
    const scheduled = announcement({ id: 'later', startsAt: days(3), endsAt: days(4) });
    expect(showing([live, scheduled], NOW)?.id).toBe('live');
  });
});

describe('taking one down early', () => {
  it('ends it now rather than deleting it', () => {
    // What the site said, and when, is a thing somebody will eventually have to
    // answer for — most likely the time it said something wrong.
    const ended = endedNow(announcement(), NOW);
    expect(ended.endsAt).toEqual(NOW);
    expect(ended.id).toBe('a1');
  });

  it('makes it stop showing immediately', () => {
    const ended = endedNow(announcement(), NOW);
    expect(showing([ended], NOW)).toBeNull();
  });

  it('refuses to end one that has not started', () => {
    // It would leave `ends_at` before `starts_at`, which the database refuses
    // anyway. Withdrawing an unstarted notice is a different act.
    expect(() => endedNow(announcement({ startsAt: hours(2) }), NOW))
      .toThrow(InvalidTransition);
  });

  it('names the announcement in the error, not the sub-order', () => {
    expect(() => endedNow(announcement({ startsAt: hours(2) }), NOW))
      .toThrow(/announcement/);
  });
});
