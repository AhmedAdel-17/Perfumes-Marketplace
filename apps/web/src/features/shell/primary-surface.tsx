/**
 * The look of a primary action, shared by server and client components.
 *
 * NO `'use client'` DIRECTIVE, and that is the entire reason this file exists
 * separately from `PrimaryButton.tsx`.
 *
 * A plain constant exported from a `'use client'` module does not cross back to
 * the server as a value. It arrives as a client reference — a stub function
 * that throws if called — and interpolating it into a template string produces
 * the TEXT OF THAT ERROR. Which is what happened: a server component imported
 * `primarySurface`, joined it into a className, and the buy button rendered
 * twenty-one pixels tall wearing a stringified exception as its class list.
 *
 * Nothing threw. TypeScript was satisfied — the type is `string` on both sides.
 * The audit caught it as a tap-target failure, three steps from the cause.
 *
 * A module with no directive is usable from both sides, so shared VALUES live
 * here and the interactive component stays in the client module.
 */
/**
 * A FLAT FILL, the ink of the page inverted (identity v2, FD-1 and FD-7).
 *
 * The metallic gradient this replaced was the most "generated" element on screen
 * by the redesign audit's own account (`docs/frontend/01` §2). Both chosen
 * directions use a solid action: in Laboratoire a sepia slab that turns olive
 * under the pointer, in Noir a bone slab on black. Both are the same three
 * roles — `ink` as the fill, `ground` as the label, the accent surface on hover
 * — so there is no per-theme code here at all.
 *
 * The label is medium, never bold — bold type on a solid slab is the loudest
 * thing an interface can do, and law VII is never shout — and it is not
 * tracked, because most labels are Arabic and tracking breaks the joins.
 */
/*
 * THE SWEEP (17 Oct 2026, founder brief: "dynamic styling for buttons"). The
 * accent no longer snaps in on hover: it is a layer behind the label that
 * fills the slab from the reading edge on the slow curve, and drains back
 * toward it when the pointer leaves — the button seems to take a breath.
 * `isolate` plus `-z-10` keeps the layer above the slab's own fill and below
 * its label, so no button needs a wrapper around its text. An arrow inside
 * eases one step forward, in the reading direction.
 *
 * Under reduced motion the global rule collapses the sweep to an instant
 * fill, which is exactly the old behaviour.
 */
export const primarySurface = [
  'relative isolate flex h-control items-center justify-center gap-3 overflow-hidden rounded-none',
  'bg-ink text-bodyLg font-medium text-ground',
  'transition-colors duration-slow ease-out',
  'before:absolute before:inset-0 before:-z-10 before:bg-accent-surface before:content-[""]',
  'before:origin-[var(--edge-start)] before:scale-x-0',
  'before:transition-transform before:duration-slow before:ease-out',
  'hover:text-on-accent hover:before:scale-x-100',
  'focus-visible:text-on-accent focus-visible:before:scale-x-100',
  'active:opacity-press',
  '[&_svg]:transition-transform [&_svg]:duration-slow [&_svg]:ease-out',
  'ltr:hover:[&_svg]:translate-x-1 rtl:hover:[&_svg]:-translate-x-1',
  'disabled:opacity-disabled disabled:hover:text-ground disabled:hover:before:scale-x-0',
].join(' ');

/**
 * The SECONDARY action: ruled, not filled — for a door that matters but is not
 * the page's purchase, such as a house applying from the footer. The same
 * sweep as the primary, inverted: the ink fills the frame from the reading edge
 * and the label turns to the ground. One look for every such door, not a
 * bordered button invented per screen.
 */
export const secondarySurface = [
  'relative isolate flex h-control items-center justify-center gap-3 overflow-hidden rounded-none',
  'border border-ink text-bodyLg font-medium text-ink',
  'transition-colors duration-slow ease-out',
  'before:absolute before:inset-0 before:-z-10 before:bg-ink before:content-[""]',
  'before:origin-[var(--edge-start)] before:scale-x-0',
  'before:transition-transform before:duration-slow before:ease-out',
  'hover:text-ground hover:before:scale-x-100',
  'focus-visible:text-ground focus-visible:before:scale-x-100',
  'active:opacity-press',
  '[&_svg]:transition-transform [&_svg]:duration-slow [&_svg]:ease-out',
  'ltr:hover:[&_svg]:translate-x-1 rtl:hover:[&_svg]:-translate-x-1',
].join(' ');
