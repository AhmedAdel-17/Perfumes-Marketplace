'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The browser's half of the cart.
 *
 * It holds INTENT — which product, how many — and the price it was last shown.
 * It does not hold a total, and nothing it stores is ever charged: every figure
 * on every screen comes back from `cart.price` on the server, recomputed from
 * the catalogue at that moment. See `packages/domain/services/cart.ts`.
 *
 * `seenPricePiastres` exists so the server can say "this went up since you
 * added it" rather than silently re-billing. It is evidence, never authority.
 *
 * WHY NOT A SERVER CART. A shopper must be able to fill a basket before they
 * have any identity, and on this marketplace identity is a phone number and an
 * OTP. Forcing that at "add to bag" instead of at checkout is the most expensive
 * possible place to ask for it.
 *
 * WHY NOT REDUX. ARCHITECTURE.md §3.2 — Redux Toolkit is for client state on
 * MOBILE. On web, server data lives in the query layer and the only genuinely
 * client-side state is this list. A store for one array is ceremony.
 */

export interface CartEntry {
  readonly productId: string;
  readonly quantity: number;
  readonly seenPricePiastres: number;
}

interface CartApi {
  readonly entries: readonly CartEntry[];
  /** True until localStorage has been read, so the count never flashes wrong. */
  readonly hydrated: boolean;
  readonly itemCount: number;
  add(entry: CartEntry): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
}

const KEY = 'diyar.cart.v1';
const MAX_QUANTITY_PER_LINE = 10;

const CartContext = createContext<CartApi | null>(null);

/**
 * Anything read from localStorage is untrusted input.
 *
 * It survives across deploys, it is editable by hand, and it can be written by
 * an older version of this code. Parsing it as `CartEntry[]` because it was
 * written as one is how a cart page crashes on a string quantity. Every field
 * is checked, and anything that fails is dropped rather than repaired — a
 * silently "fixed" entry is a quantity the customer did not choose.
 */
function parse(raw: string | null): CartEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): CartEntry[] => {
      if (typeof item !== 'object' || item === null) return [];
      const { productId, quantity, seenPricePiastres } = item as Record<string, unknown>;
      if (typeof productId !== 'string' || productId === '') return [];
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return [];
      if (typeof seenPricePiastres !== 'number' || !Number.isInteger(seenPricePiastres)) return [];
      return [{
        productId,
        quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE),
        seenPricePiastres,
      }];
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<readonly CartEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read AFTER mount, never during render. The server has no localStorage, so
  // reading it in the initial state makes the first client render disagree with
  // the server's HTML and React discards the tree.
  useEffect(() => {
    try {
      setEntries(parse(window.localStorage.getItem(KEY)));
    } catch {
      // Private mode, or storage disabled. An empty cart is a working page.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;   // Never write before the first read, or it wipes.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      // Quota or private mode. The cart still works for this page view.
    }
  }, [entries, hydrated]);

  // Two tabs are one shopper. Without this, adding in one tab and checking out
  // in the other silently drops the addition.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setEntries(parse(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((entry: CartEntry) => {
    setEntries((current) => {
      const existing = current.find((e) => e.productId === entry.productId);
      if (!existing) return [...current, entry];
      return current.map((e) =>
        e.productId === entry.productId
          ? {
              ...e,
              quantity: Math.min(e.quantity + entry.quantity, MAX_QUANTITY_PER_LINE),
              // Adopt the price just seen, so the change notice reflects the
              // most recent thing the customer was actually shown.
              seenPricePiastres: entry.seenPricePiastres,
            }
          : e,
      );
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setEntries((current) =>
      quantity < 1
        ? current.filter((e) => e.productId !== productId)
        : current.map((e) =>
            e.productId === productId
              ? { ...e, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }
              : e,
          ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setEntries((current) => current.filter((e) => e.productId !== productId));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo<CartApi>(() => ({
    entries,
    hydrated,
    itemCount: entries.reduce((n, e) => n + e.quantity, 0),
    add, setQuantity, remove, clear,
  }), [entries, hydrated, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
