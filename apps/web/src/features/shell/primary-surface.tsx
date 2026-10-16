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
export const primarySurface = [
  'relative flex h-control items-center justify-center gap-3 rounded-none',
  'bg-ink text-bodyLg font-medium text-ground',
  'transition-colors duration-base ease-out',
  'hover:bg-accent-surface hover:text-on-accent active:opacity-press',
  'disabled:opacity-disabled disabled:hover:bg-ink disabled:hover:text-ground',
].join(' ');
