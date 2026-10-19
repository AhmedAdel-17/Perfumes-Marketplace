/**
 * Every refusal a house can meet while adding photographs has a sentence.
 *
 * The domain names the objections; `packages/i18n` words them; neither can
 * import the other. This is the one place both lists are in scope, so a new
 * objection with no sentence fails here instead of reaching a house as a code.
 */
import { describe, expect, it } from 'vitest';
import { IMAGE_OBJECTIONS, PHOTO_OBJECTIONS, RELIEF_OBJECTIONS } from '@diyar/domain';
import { IMAGE_OBJECTION_AR, PHOTO_OBJECTION_AR, RELIEF_OBJECTION_AR } from '@diyar/i18n';

const sorted = (values: Iterable<string>) => [...values].sort();

describe('the photograph vocabulary', () => {
  it('words every file objection, and no others', () => {
    expect(sorted(Object.keys(IMAGE_OBJECTION_AR))).toEqual(sorted(IMAGE_OBJECTIONS));
  });

  it('words every photograph objection, and no others', () => {
    expect(sorted(Object.keys(PHOTO_OBJECTION_AR))).toEqual(sorted(PHOTO_OBJECTIONS));
  });

  it('words every relief objection the console can meet, and no others', () => {
    expect(sorted(Object.keys(RELIEF_OBJECTION_AR))).toEqual(sorted(RELIEF_OBJECTIONS));
  });

  it('every sentence is Arabic, and says what to do', () => {
    for (const sentence of [
      ...Object.values(IMAGE_OBJECTION_AR), ...Object.values(PHOTO_OBJECTION_AR), ...Object.values(RELIEF_OBJECTION_AR),
    ]) {
      expect(sentence).toMatch(/[؀-ۿ]/);
      // A full sentence, not a label: an instruction ends.
      expect(sentence.trim()).toMatch(/[.؟]$/);
    }
  });
});
