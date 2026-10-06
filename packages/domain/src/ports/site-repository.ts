/**
 * Port: site-level content.
 *
 * Announcements and homepage curation. The domain states what it needs and
 * nothing about how a store works, the same as every other port here.
 */
import type { Announcement } from '../content/announcement';

export interface Curation {
  /** Which product opens the homepage. Null means "whatever the catalogue
   *  lists first", which is the behaviour the site had before curation. */
  readonly heroProductId: string | null;
  /** Ordered. The running order IS the curation decision. */
  readonly featuredProductIds: readonly string[];
}

export interface SiteRepository {
  /** Everything scheduled, newest window first. For the console. */
  allAnnouncements(): Promise<Announcement[]>;

  /**
   * What is in window right now.
   *
   * Separate from `allAnnouncements` rather than a flag on it, for the reason
   * the content port splits `findLive` from `findBySlug`: one forgotten
   * argument would put a scheduled announcement on the site early, and
   * "free delivery from Sunday" showing on Thursday is a discount announced
   * three days early to whoever happened to be looking.
   */
  currentAnnouncements(now: Date): Promise<Announcement[]>;

  post(input: {
    message: string;
    /** Optional English line (D-3). */
    messageEn?: string | null;
    href: string | null;
    startsAt: Date;
    endsAt: Date;
    createdBy: string;
  }): Promise<Announcement>;

  /**
   * End one now. Returns false when there was nothing to end.
   *
   * It never deletes: what the site said, and when, is a thing somebody will
   * eventually have to answer for — most likely the time it said something
   * wrong — and deletion answers that question with silence.
   */
  endAnnouncement(id: string, at: Date): Promise<boolean>;

  curation(): Promise<Curation>;
  setCuration(input: Curation & { updatedBy: string }): Promise<void>;
}
