'use client';

import { useEffect, useRef, useState } from 'react';
import { recordBrowsing } from '@/features/analytics/record';
import { PRODUCT } from '@diyar/i18n';
import { useLocale } from '@/features/shell/LocaleProvider';
import { canHover, clamp, prefersStill } from '@/features/motion/motion';
import { useCart } from './CartStore';
import { flyDrop } from './drop';

/**
 * The primary action on a product page.
 *
 * Two details that separate this from a framework button:
 *
 *  1. It CONFIRMS. A control that does something invisible has, as far as the
 *     customer can tell, done nothing — and the second tap is how baskets end
 *     up with two of everything. The label changes to "أُضيف إلى الحقيبة" for a
 *     moment, in place, without a toast flying in from a corner.
 *  2. It stays disabled until the cart has read localStorage. Before that the
 *     store genuinely does not know what is in the basket, and adding would
 *     write over a cart from the previous visit.
 *
 * LA GOUTTE (Les Détails, 20 Oct 2026): under a mouse the slab leans a little
 * toward the pointer as it comes near, its label a little more, as if drawn to
 * the hand; pressed, a drop of the perfume leaves it for the bag (`drop.ts`).
 * Both stand still for a visitor who asked for less motion, and the lean never
 * happens under a finger — there is no pointer to lean toward.
 */

/** How near the pointer must come before the slab feels it, in px. */
const FIELD = 160;

/**
 * The web knows no haptic intensities, only durations (tokens.json `haptic`
 * names them for the native apps): a short pulse is the "confirm" tick, and it
 * plays on the one press that puts a bottle in the bag — rare by design.
 */
const CONFIRM_PULSE_MS = 12;

export function AddToBag({
  productId,
  pricePiastres,
  inStock,
  family,
  drop = true,
  className = '',
}: {
  productId: string;
  pricePiastres: number;
  inStock: boolean;
  /** The scent-family code: the colour of the drop. */
  family: string;
  /** False where the masthead's bag cannot be seen — inside the reveal's dark room. */
  drop?: boolean;
  className?: string;
}) {
  const { add, hydrated } = useCart();
  const [confirmed, setConfirmed] = useState(false);
  // Whether the label has ever changed: only then does a new label fade in, so
  // the button does not flash its own words as the page loads.
  const [pressed, setPressed] = useState(false);
  const copy = PRODUCT[useLocale()];
  const button = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // The lean: one listener on the window while the button is on screen, its
  // work done once a frame. Off under a finger and under reduced motion.
  useEffect(() => {
    const slab = button.current, words = label.current;
    if (!slab || !words || !canHover() || prefersStill()) return;
    let visible = false, frame = 0, pointer: { x: number; y: number } | null = null;
    const settle = () => { slab.style.transform = ''; words.style.transform = ''; };
    const lean = () => {
      frame = 0;
      if (!pointer || slab.disabled) { settle(); return; }
      const r = slab.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
      const pull = clamp(1 - Math.hypot(dx, dy) / FIELD);
      if (pull === 0) { settle(); return; }
      slab.style.transform = `translate(${(dx * 0.1 * pull).toFixed(2)}px, ${(dy * 0.16 * pull).toFixed(2)}px)`;
      words.style.transform = `translate(${(dx * 0.07 * pull).toFixed(2)}px, ${(dy * 0.1 * pull).toFixed(2)}px)`;
    };
    const move = (event: PointerEvent) => {
      if (!visible || event.pointerType !== 'mouse') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(lean);
    };
    const away = () => { pointer = null; settle(); };
    const seen = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (!visible) away();
    });
    seen.observe(slab);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', away);
    return () => {
      seen.disconnect();
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', away);
      cancelAnimationFrame(frame);
      settle();
    };
  }, []);

  const onClick = () => {
    add({ productId, quantity: 1, seenPricePiastres: pricePiastres });
    // Not awaited, and it cannot throw: the bag is updated whatever analytics
    // does, and the confirmation below must not wait on a database write.
    void recordBrowsing('cart_add', { productId });
    setConfirmed(true);
    setPressed(true);
    if (drop && button.current) flyDrop(button.current, family);
    if (!prefersStill() && !canHover()) navigator.vibrate?.(CONFIRM_PULSE_MS);
    // Long enough to read, short enough that a second genuine add is not
    // blocked. The button stays live throughout; only the label changes.
    window.setTimeout(() => setConfirmed(false), 1800);
  };

  const words = !inStock ? copy.outOfStock : confirmed ? copy.added : copy.addToBag;
  return (
    <button
      ref={button}
      type="button"
      onClick={onClick}
      disabled={!inStock || !hydrated}
      aria-live="polite"
      className={`drop-slab ${className}`}
    >
      {/* Its own box so it can lean further than the slab; keyed by the words
          so a change of label arrives rather than snapping. */}
      <span ref={label} className="drop-label">
        <span key={words} className={pressed ? 'drop-words' : undefined}>{words}</span>
      </span>
    </button>
  );
}
