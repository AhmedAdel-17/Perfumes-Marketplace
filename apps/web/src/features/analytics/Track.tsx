'use client';

import { useEffect, useRef } from 'react';
import type { BrowsingEvent } from '@diyar/domain';
import { recordBrowsing } from './record';

/**
 * Fire one view event for the page that renders this — WORK_PLAN 9.5.
 *
 * Renders nothing. It exists as a component rather than a hook so a server
 * component — which every page here is — can drop it in without becoming a
 * client component itself.
 *
 * ONCE PER MOUNT, guarded by a ref. React's development StrictMode runs effects
 * twice on purpose, and without the guard every view would be counted twice in
 * development and once in production: two different numbers for the same screen,
 * discovered later by somebody trying to reconcile them.
 *
 * It does NOT fire on route changes of its own accord — each page renders its
 * own `Track`, so a navigation mounts a new one. That keeps "what counts as a
 * view" a decision each page makes, rather than a router-level rule that fires
 * for modals, query-string changes and back navigation as well.
 */
export function Track({ event, productId, sellerId }: {
  event: BrowsingEvent;
  productId?: string;
  sellerId?: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void recordBrowsing(event, {
      ...(productId ? { productId } : {}),
      ...(sellerId ? { sellerId } : {}),
    });
  }, [event, productId, sellerId]);

  return null;
}
