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
  // Last, because these are where the work is READ rather than done: what the
  // business is doing, and who decided what.
  { key: 'insights', href: '/ops/insights', label: 'التقارير' },
  { key: 'audit', href: '/ops/audit', label: 'سجل القرارات' },
] as const;

export type OpsSection = (typeof DESTINATIONS)[number]['key'];

export function OpsNav({ current }: { current: OpsSection }) {
  const link = (active: boolean) =>
    [
      // `خروج` is three narrow glyphs — 37px wide, under the floor on the CROSS
      // axis even with the height fixed. A target has two dimensions and only
      // one of them was being enforced.
      'tappable flex min-h-touch min-w-touch items-center text-caption tracking-label',
      'transition-colors duration-base ease-out hover:text-accent',
      active ? 'text-ink' : 'text-ink3',
    ].join(' ');

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <nav aria-label="أقسام التشغيل" className="flex flex-wrap items-center gap-x-5">
        {DESTINATIONS.map((destination) => (
          <a
            key={destination.key}
            href={destination.href}
            // The current section is named to assistive technology as well as
            // coloured. Colour alone carrying "you are here" is the rule the
            // accessibility floor exists to stop.
            aria-current={current === destination.key ? 'page' : undefined}
            className={link(current === destination.key)}
          >
            {destination.label}
          </a>
        ))}
      </nav>

      {/* The consoles have no site footer, so appearance lives beside the
          navigation here. An operator reads these screens all day; which way
          they are lit is not a cosmetic question for them. */}
      <ThemeToggle />

      <form action={signOutOps}>
        <button type="submit" className={link(false)}>
          خروج
        </button>
      </form>
    </div>
  );
}
