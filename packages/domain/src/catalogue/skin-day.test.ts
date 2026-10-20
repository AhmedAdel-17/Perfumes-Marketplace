import { describe, expect, it } from 'vitest';
import { LONGEVITY_BANDS, PROJECTION_BANDS } from './vocabularies';
import { NOTE_TIERS } from './note-index';
import {
  DIAL_HOURS, isLongevityBand, isProjectionBand, noteHours, phaseAt, presence, sillageAt, skinDay, strengthAt,
} from './skin-day';

/**
 * The dial draws a declared band, so its shape must say what the band says and
 * nothing more: a longer band lasts longer on the face, a stronger projection
 * reaches further, and the sequence is always top, then heart, then base.
 */
describe('a day on the skin is drawn from the declared bands', () => {
  it('fits every longevity band on the twelve-hour face, in order', () => {
    const spans = LONGEVITY_BANDS.map((band) => skinDay(band, 'moderate').span);
    expect(spans).toEqual([...spans].sort((a, b) => a - b));
    expect(new Set(spans).size).toBe(spans.length);
    expect(Math.max(...spans)).toBeLessThan(DIAL_HOURS);
    expect(Math.min(...spans)).toBeGreaterThan(1);
  });

  it('reaches further for every stronger projection band', () => {
    const reach = PROJECTION_BANDS.map((band) => skinDay('long', band).reach);
    expect(reach).toEqual([...reach].sort((a, b) => a - b));
    expect(new Set(reach).size).toBe(reach.length);
  });

  it('opens with the top, which is gone within the first hour, whatever the band', () => {
    for (const band of LONGEVITY_BANDS) {
      const day = skinDay(band, 'moderate');
      expect(presence(day.tiers.top, 0)).toBe(1);
      expect(presence(day.tiers.top, 1)).toBe(0);
      expect(phaseAt(day, 0.1)).toBe('top');
    }
  });

  it('leaves the base last, ending where the band is drawn', () => {
    for (const band of LONGEVITY_BANDS) {
      const day = skinDay(band, 'moderate');
      expect(day.tiers.base.end).toBe(day.span);
      expect(day.tiers.base.end).toBeGreaterThan(day.tiers.heart.end);
      expect(day.tiers.heart.end).toBeGreaterThan(day.tiers.top.end);
      expect(presence(day.tiers.base, day.span + 0.01)).toBe(0);
      expect(phaseAt(day, day.span)).toBe('trace');
    }
  });

  it('passes through its phases in order, never back', () => {
    const order = ['top', 'heart', 'base', 'trace'];
    for (const band of LONGEVITY_BANDS) {
      const day = skinDay(band, 'strong');
      let last = 0;
      for (let t = 0; t <= DIAL_HOURS; t += 0.05) {
        const at = order.indexOf(phaseAt(day, t));
        expect(at).toBeGreaterThanOrEqual(last);
        last = at;
      }
      expect(last).toBe(3);
    }
  });

  it('keeps every presence between nothing and full', () => {
    const day = skinDay('very_long', 'enormous');
    for (let t = -1; t <= 13; t += 0.1) {
      for (const tier of NOTE_TIERS) {
        const p = presence(day.tiers[tier], t);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(strengthAt(day, t)).toBeLessThanOrEqual(1);
      expect(sillageAt(day, t)).toBeLessThanOrEqual(day.reach);
    }
  });

  it('sets each note where its tier is strong, in the house’s order', () => {
    const day = skinDay('long', 'moderate');
    for (const tier of NOTE_TIERS) {
      const hours = noteHours(day, tier, 3);
      expect(hours).toEqual([...hours].sort((a, b) => a - b));
      for (const h of hours) expect(presence(day.tiers[tier], h)).toBeGreaterThan(0.14);
    }
    expect(noteHours(day, 'heart', 0)).toEqual([]);
    expect(noteHours(day, 'base', 1)).toHaveLength(1);
  });

  it('knows its vocabularies, and nothing else', () => {
    expect(isLongevityBand('very_long')).toBe(true);
    expect(isLongevityBand('short')).toBe(false);
    expect(isProjectionBand('intimate')).toBe(true);
    expect(isProjectionBand('long')).toBe(false);
  });
});
