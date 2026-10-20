/**
 * Which perfumes this visit has already seen revealed — so the reveal is the
 * way into a perfume's page the FIRST time only (founder, 20 Oct 2026). The
 * second time, a card is simply a link: a ceremony repeated on every press
 * stops being one.
 *
 * A visit is the browser tab's session (`sessionStorage`, which a closed tab
 * forgets). A perfume counts as revealed once its reveal has PLAYED — from a
 * card, or from the control on its page — not merely once its page was seen:
 * a visitor who landed on a perfume from a link in a house's bio has not yet
 * watched it stand up.
 *
 * Storage that refuses (a private window, a full quota, a sandboxed frame) is
 * not an error: the memory falls back to this page's own, so the reveal still
 * plays once per perfume until the tab reloads.
 */
const KEY = 'diyar.revealed';
/** Enough for any visit; a tab left open for weeks does not grow without end. */
const LIMIT = 200;

export type VisitStore = Pick<Storage, 'getItem' | 'setItem'>;

const memory = new Set<string>();

const session = (): VisitStore | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

function read(store: VisitStore | null): string[] {
  try {
    const raw = store?.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function revealedThisVisit(productId: string, store: VisitStore | null = session()): boolean {
  return memory.has(productId) || read(store).includes(productId);
}

export function rememberRevealed(productId: string, store: VisitStore | null = session()): void {
  memory.add(productId);
  const list = read(store).filter((id) => id !== productId);
  list.push(productId);
  try {
    store?.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    // Kept in this page's memory only; see above.
  }
}

/** For tests: this page's own memory, emptied. */
export function forgetVisitMemory(): void {
  memory.clear();
}
