'use client';

/**
 * The one primary action.
 *
 * This markup was copy-pasted into seven files — checkout, cart, both
 * sign-ins, the seller queue, the ops console, the buy bar — each carrying its
 * own copy of the brass gradient as three hard-coded hexes. Which meant the
 * brand's most repeated surface was the one place the token system did not
 * reach, and a change to `brass` would have moved every button EXCEPT the ones
 * people press.
 *
 * The look lives in `primary-surface.tsx`, which carries no `'use client'`
 * directive so a server component can import it too. See the note there: a
 * constant exported from a client module does not survive the trip.
 */
import {
  PrimaryHighlight, primarySurface, primarySurfaceStyle,
} from './primary-surface';

export function PrimaryButton({
  children,
  type = 'button',
  disabled = false,
  onClick,
  fill = 'full',
  className = '',
  ...rest
}: {
  children: React.ReactNode;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  /** `full` spans its container; `auto` hugs its label; `flex` shares a row. */
  fill?: 'full' | 'auto' | 'flex';
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled' | 'onClick'>) {
  const width = fill === 'full' ? 'w-full' : fill === 'flex' ? 'flex-1' : 'px-7';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={primarySurfaceStyle}
      className={[primarySurface, width, className].join(' ')}
      {...rest}
    >
      <PrimaryHighlight />
      {children}
    </button>
  );
}
