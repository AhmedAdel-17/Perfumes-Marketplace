/**
 * The notice above everything.
 *
 * Renders nothing at all when nothing is in window, which is the normal state —
 * a site with a permanent bar is a site whose bar is invisible, and the whole
 * value of this strip is that its presence means something.
 *
 * Deliberately NOT dismissible. A dismiss control on a delivery delay teaches
 * people to close it before reading, and the one notice that matters is the one
 * they dismissed last week out of habit. It expires by itself instead, which is
 * the honest way to stop showing something.
 */
import { api } from '@/core/api';

export async function AnnouncementBar() {
  const announcement = await api().site.announcement();
  if (!announcement) return null;

  const body = (
    <span className="text-caption leading-relaxed text-accent lg:text-small">
      {announcement.message}
    </span>
  );

  return (
    <div
      // `role="status"` rather than `alert`: an alert interrupts a screen
      // reader mid-sentence, and a shipping notice is not worth interrupting
      // someone for. It is announced when they reach it.
      role="status"
      // The raised surface, not a 7% tint of accent: the message is set in the
      // accent ink, which is proven against the surfaces and not against a
      // tint of itself. The brass rule beneath still marks it as a notice.
      className="border-b border-accent/25 bg-raised px-5 py-2.5 text-center"
    >
      {announcement.href ? (
        <a
          href={announcement.href}
          className="tappable inline-flex min-h-touch items-center justify-center underline decoration-accent/40 underline-offset-4 transition-colors duration-base ease-out hover:decoration-accent"
        >
          {body}
        </a>
      ) : body}
    </div>
  );
}
