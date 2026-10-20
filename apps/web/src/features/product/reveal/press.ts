/**
 * The two questions the reveal asks of the visitor's hand when it is the way
 * into a perfume's page (founder, 20 Oct 2026) — kept apart from the DOM so
 * they can be tested on their own.
 */

export interface PressLike {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/**
 * A press that would follow a link in THIS tab, and that nothing else has
 * already taken: the only kind the reveal may take over. A middle button or a
 * modifier asks for a new tab or window — that visitor is not coming with us.
 */
export const isPlainPress = (e: PressLike): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;

/** Whether the link pressed goes to the perfume the card is about — not to some other link inside it. */
export function leadsToPerfume(linkHref: string, perfumeHref: string, here: string): boolean {
  try {
    const link = new URL(linkHref, here), perfume = new URL(perfumeHref, here);
    return link.origin === perfume.origin && link.pathname === perfume.pathname;
  } catch {
    return false;
  }
}

/** Keys that are not a request to move on: moving focus, and modifiers pressed alone. */
const NOT_ONWARD = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

/** While the reveal leads to a page, any other key — Escape, Enter, Space, an arrow — goes straight there. */
export const keyGoesOnward = (key: string): boolean => !NOT_ONWARD.has(key);
