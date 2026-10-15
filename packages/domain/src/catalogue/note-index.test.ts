import { describe, expect, it } from 'vitest';
import { noteIndex, type NotedProduct } from './note-index';

const perfume = (top: string[], heart: string[] = [], base: string[] = []): NotedProduct => ({
  notesTop: top, notesHeart: heart, notesBase: base,
});

describe('the notes index', () => {
  it('counts the perfumes that carry each note, most-used first', () => {
    const index = noteIndex([
      perfume(['برغموت', 'هيل']),
      perfume(['برغموت']),
      perfume(['زعفران', 'برغموت']),
    ], 10);
    expect(index.top).toEqual([
      { note: 'برغموت', count: 3 },
      { note: 'زعفران', count: 1 },
      { note: 'هيل', count: 1 },
    ]);
  });

  it('counts a perfume once, however many times its house wrote the note', () => {
    expect(noteIndex([perfume([], [], ['عود', 'عود', ' عود '])], 10).base)
      .toEqual([{ note: 'عود', count: 1 }]);
  });

  it('keeps the tiers apart: where a note sits is what the index shows', () => {
    const index = noteIndex([perfume(['ورد']), perfume([], ['ورد'])], 10);
    expect(index.top).toEqual([{ note: 'ورد', count: 1 }]);
    expect(index.heart).toEqual([{ note: 'ورد', count: 1 }]);
    expect(index.base).toEqual([]);
  });

  it('breaks ties alphabetically, so two loads of one catalogue agree', () => {
    const first = noteIndex([perfume(['مسك', 'عنبر', 'ياسمين'])], 10).top.map((n) => n.note);
    const second = noteIndex([perfume(['ياسمين', 'مسك', 'عنبر'])], 10).top.map((n) => n.note);
    expect(first).toEqual(second);
    expect(first).toEqual(['عنبر', 'مسك', 'ياسمين']);
  });

  it('caps each tier, keeping the most-used', () => {
    const index = noteIndex([
      perfume(['أ', 'ب', 'ج']),
      perfume(['ب', 'ج']),
      perfume(['ج']),
    ], 2);
    expect(index.top.map((n) => n.note)).toEqual(['ج', 'ب']);
  });

  it('ignores empty notes, and answers an empty catalogue with empty tiers', () => {
    expect(noteIndex([perfume(['', '  '])], 5).top).toEqual([]);
    expect(noteIndex([], 5)).toEqual({ top: [], heart: [], base: [] });
  });
});
