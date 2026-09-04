/**
 * The block schema, at the boundary.
 *
 * Blocks arrive as JSON from a browser and are stored as JSONB, which means the
 * database cannot check their shape and TypeScript is only checking what we
 * BELIEVE arrived. This is the one place that turns the belief into a fact.
 *
 * Every limit here comes from `LIMITS` in the domain rather than being retyped.
 * A schema that permits a 500-character heading the domain will refuse to
 * publish is a schema that lets an editor write something, save it, and then be
 * told it was never acceptable — the constraint has to be the same constraint.
 *
 * `.strict()` throughout: an unknown key means the caller is sending a shape
 * this system does not model, and silently dropping it is how a field ends up
 * half-implemented — written by the client, ignored by the server, and reported
 * as a bug months later by whoever notices it never took effect.
 */
import { z } from 'zod';
import { HEADING_LEVELS, LIMITS, isInternalPath, type Block } from '@diyar/domain';

const trimmed = (max: number) => z.string().trim().max(max);

const heading = z.object({
  kind: z.literal('heading'),
  // From the domain's tuple, so adding a level is one edit rather than two.
  level: z.union([z.literal(HEADING_LEVELS[0]), z.literal(HEADING_LEVELS[1])]),
  text: trimmed(LIMITS.headingText),
}).strict();

const passage = z.object({
  kind: z.literal('passage'),
  text: trimmed(LIMITS.passageText),
}).strict();

const pullQuote = z.object({
  kind: z.literal('pull_quote'),
  text: trimmed(LIMITS.quoteText),
  attribution: trimmed(LIMITS.attribution).optional(),
}).strict();

const noteList = z.object({
  kind: z.literal('note_list'),
  items: z.array(z.object({
    term: trimmed(LIMITS.noteTerm),
    detail: trimmed(LIMITS.noteDetail).optional(),
  }).strict()).max(LIMITS.noteItems),
}).strict();

const image = z.object({
  kind: z.literal('image'),
  mediaKey: z.string().trim().min(1).max(200),
  alt: trimmed(LIMITS.alt),
  caption: trimmed(LIMITS.caption).optional(),
}).strict();

const divider = z.object({ kind: z.literal('divider') }).strict();

const callToAction = z.object({
  kind: z.literal('call_to_action'),
  label: trimmed(LIMITS.ctaLabel),
  /*
   * The link rule is enforced HERE as well as at publish time, and the
   * duplication is deliberate.
   *
   * Publishing checks it because that is when content goes live. This checks it
   * because an external link should never be stored at all: a draft is
   * previewable, previews get shared, and "it was only in a draft" is not a
   * defence anybody wants to make about a phishing link on their own domain.
   */
  href: z.string().refine(isInternalPath, 'الروابط الخارجية غير مسموح بها'),
}).strict();

export const blockSchema = z.discriminatedUnion('kind', [
  heading, passage, pullQuote, noteList, image, divider, callToAction,
]);

/**
 * A whole document.
 *
 * `blocksPerPage` is the domain's limit and this is where it stops being
 * advisory: without a cap, one paste of a novel becomes a JSONB row the console
 * cannot open again.
 */
export const blocksSchema = z.array(blockSchema).max(LIMITS.blocksPerPage);

/**
 * The parsed type must be assignable to the domain's `Block`.
 *
 * This assignment does nothing at runtime and is the entire point: if a block
 * gains a field in the domain and not here, or the two disagree about whether
 * something is optional, the build fails on this line rather than at the moment
 * a page fails to render.
 */
const _blockShapesAgree: Block = {} as z.infer<typeof blockSchema>;
void _blockShapesAgree;

export const pageTitleSchema = z.string().trim().min(1, 'أدخل عنوان الصفحة').max(160);
