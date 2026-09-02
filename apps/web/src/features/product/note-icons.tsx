/**
 * Tier glyphs. Single stroke system, 1.3 weight, from the icon set —
 * CLAUDE.md §12: never draw a new icon without asking.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.05,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 32,
  height: 32,
};

const Top = () => (
  <svg {...base} aria-hidden>
    <path d="M12 3c3 3 4.5 6 4.5 9a4.5 4.5 0 01-9 0c0-3 1.5-6 4.5-9z" />
  </svg>
);

const Heart = () => (
  <svg {...base} aria-hidden>
    <path d="M12 20.5s-7.5-4.8-7.5-10.4A4.1 4.1 0 0112 8a4.1 4.1 0 017.5 2.1c0 5.6-7.5 10.4-7.5 10.4z" />
  </svg>
);

const Base = () => (
  <svg {...base} aria-hidden>
    <path d="M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 12c0-2.6-1.8-4.5-4.5-4.5 0 2.6 1.8 4.5 4.5 4.5z" />
  </svg>
);

export const NOTE_ICON = { top: Top, heart: Heart, base: Base } as const;
