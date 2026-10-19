import { ThemeToggle } from '@/features/shell/ThemeToggle';
import { signOutOps } from './actions';

/**
 * The operations console's own chrome.
 *
 * WHY THIS EXISTS. There were four navigations, one per route, written by hand
 * where each page happened to need one — so they disagreed. The queue, which is
 * where an operator lands after signing in, offered exactly one control: sign
 * out. From the console's front door there was no way to reach moderation, the
 * content list or the site settings; you had to already know the URLs. Nothing
 * was broken, every page rendered, and the console simply had no navigation.
 *
 * That is the ordinary cost of duplicated chrome: it does not drift loudly, it
 * drifts by omission. One component means a destination added here appears
 * everywhere, and it cannot appear on three screens out of four again.
 *
 * The order is the order of the work: what is waiting, what needs a decision,
 * what is published, what the site says. Sign-out last, and set apart, because
 * it is the one control here that ends the session.
 */
const DESTINATIONS = [
  { key: 'queue', href: '/ops/queue', label: 'قائمة التشغيل' },
  { key: 'moderation', href: '/ops/moderation', label: 'مراجعة المنتجات' },
  { key: 'reviews', href: '/ops/reviews', label: 'التقييمات' },
  { key: 'returns', href: '/ops/returns', label: 'الإرجاع' },
  { key: 'support', href: '/ops/support', label: 'الرسائل' },
  { key: 'houses', href: '/ops/houses', label: 'الدور' },
  { key: 'content', href: '/ops/content', label: 'المحتوى' },
  { key: 'site', href: '/ops/site', label: 'الموقع' },
  { key: 'notes', href: '/ops/notes', label: 'قاموس النفحات' },
  { key: 'reliefs', href: '/ops/reliefs', label: 'العرض المجسّم' },
  // Last, because these are where the work is READ rather than done: what the
  // business is doing, and who decided what.
  { key: 'insights', href: '/ops/insights', label: 'التقارير' },
  { key: 'audit', href: '/ops/audit', label: 'سجل القرارات' },
] as const;

export type OpsSection = (typeof DESTINATIONS)[number]['key'];

export function OpsNav({ current }: { current: OpsSection }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5">
      {/*
        Identity v2 (Phase C): the labels are Arabic, so they are not
        letterspaced (CLAUDE.md §15), and the current section is an ink rule on
        the band's line as well as `aria-current` and colour — the band reads
        as tabs, and colour never carries "you are here" alone.

        `min-w-touch` as well as the height: `خروج` is three narrow glyphs —
        37px wide, under the floor on the CROSS axis even with the height
        fixed. A target has two dimensions.
      */}
      <nav aria-label="أقسام التشغيل" className="flex flex-wrap items-center gap-x-5">
        {DESTINATIONS.map((destination) => {
          const active = current === destination.key;
          return (
            <a
              key={destination.key}
              href={destination.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex min-h-touch min-w-touch items-center justify-center border-b-2 text-body transition-colors duration-base ease-out hover:text-accent',
                active ? 'border-ink text-ink' : 'border-transparent text-ink2',
              ].join(' ')}
            >
              {destination.label}
            </a>
          );
        })}
      </nav>

      <div className="ms-auto flex items-center gap-x-5">
        {/* The consoles have no site footer, so appearance lives beside the
            navigation here. An operator reads these screens all day; which way
            they are lit is not a cosmetic question for them. */}
        <ThemeToggle />
        <form action={signOutOps}>
          <button
            type="submit"
            className="tappable flex min-h-touch min-w-touch items-center justify-center text-body text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            خروج
          </button>
        </form>
      </div>
    </div>
  );
}
