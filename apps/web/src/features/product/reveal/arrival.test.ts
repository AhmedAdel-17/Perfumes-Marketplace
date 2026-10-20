import { beforeEach, describe, expect, it } from 'vitest';
import { readKit, writeKit, type KitSource } from './kit';
import { isPlainPress, keyGoesOnward, leadsToPerfume } from './press';
import { forgetVisitMemory, rememberRevealed, revealedThisVisit, type VisitStore } from './visit';

/**
 * The reveal as the way into a perfume's page (founder, 20 Oct 2026): what a
 * card says, which presses it takes, and that it plays once per perfume per
 * visit. The choreography itself is the browser suite's (e2e.mjs).
 */

const LAYL: KitSource = {
  id: 'f1c4a5e2-0000-4000-8000-000000000001',
  family: 'oud',
  brandLatin: 'MAISON NOUR',
  photo: { width: 1000, height: 1250 },
  relief: {
    cutoutUrl: '/dev-media/reliefs/x/a.png',
    reliefUrl: '/dev-media/reliefs/x/b.png',
    placement: { centreX: 0.47, centreY: 0.49, height: 0.69, angle: 2.5 },
  },
};
const NAME = { text: 'ليل القاهرة', lang: 'ar' as const };

describe('a card’s kit', () => {
  it('says everything the reveal needs to start, and reads back as written', () => {
    const kit = readKit(writeKit(LAYL, '/p/layl-al-qahira', NAME));
    expect(kit).toEqual({
      id: LAYL.id, href: '/p/layl-al-qahira', family: 'oud', brandLatin: 'MAISON NOUR', name: NAME,
      photo: LAYL.photo, relief: LAYL.relief,
    });
  });

  it('is not written for a perfume with nothing to lift: no photograph, or no relief made from it', () => {
    expect(writeKit({ ...LAYL, relief: null }, '/p/layl-al-qahira', NAME)).toBeUndefined();
    expect(writeKit({ ...LAYL, photo: null }, '/p/layl-al-qahira', NAME)).toBeUndefined();
  });

  it('is refused when it is not one — the press is then left to the link', () => {
    const written = JSON.parse(writeKit(LAYL, '/p/layl-al-qahira', NAME)!) as Record<string, unknown>;
    const spoilt = (change: Record<string, unknown>) => readKit(JSON.stringify({ ...written, ...change }));
    expect(readKit(undefined)).toBeNull();
    expect(readKit('{not json')).toBeNull();
    expect(readKit('[]')).toBeNull();
    expect(spoilt({ href: 'https://elsewhere.example/p/x' })).toBeNull();
    expect(spoilt({ photo: { width: 0, height: 1250 } })).toBeNull();
    expect(spoilt({ name: { text: 'x', lang: 'fr' } })).toBeNull();
    expect(spoilt({ relief: { ...LAYL.relief, placement: { centreX: 'a', centreY: 0, height: 1, angle: 0 } } })).toBeNull();
  });
});

describe('the presses it takes over', () => {
  const press = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

  it('takes a plain press, and leaves a new tab, a new window and a taken press alone', () => {
    expect(isPlainPress(press)).toBe(true);
    expect(isPlainPress({ ...press, button: 1 })).toBe(false);
    expect(isPlainPress({ ...press, ctrlKey: true })).toBe(false);
    expect(isPlainPress({ ...press, metaKey: true })).toBe(false);
    expect(isPlainPress({ ...press, shiftKey: true })).toBe(false);
    expect(isPlainPress({ ...press, defaultPrevented: true })).toBe(false);
  });

  it('only on the link to the perfume itself', () => {
    const here = 'http://localhost:3100/house/maison-nour';
    expect(leadsToPerfume('http://localhost:3100/p/layl-al-qahira', '/p/layl-al-qahira', here)).toBe(true);
    expect(leadsToPerfume('http://localhost:3100/en/p/layl-al-qahira', '/en/p/layl-al-qahira', here)).toBe(true);
    expect(leadsToPerfume('http://localhost:3100/house/maison-nour', '/p/layl-al-qahira', here)).toBe(false);
    expect(leadsToPerfume('https://elsewhere.example/p/layl-al-qahira', '/p/layl-al-qahira', here)).toBe(false);
  });

  it('goes on to the page on any key but the ones that move focus or only modify', () => {
    for (const key of ['Escape', 'Enter', ' ', 'ArrowDown', 'a']) expect(keyGoesOnward(key)).toBe(true);
    for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta']) expect(keyGoesOnward(key)).toBe(false);
  });
});

describe('once per perfume per visit', () => {
  const store = (): VisitStore & { saved: Map<string, string> } => {
    const saved = new Map<string, string>();
    return { saved, getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => { saved.set(k, v); } };
  };
  beforeEach(() => forgetVisitMemory());

  it('remembers a perfume once its reveal has played, and only that perfume', () => {
    const tab = store();
    expect(revealedThisVisit(LAYL.id, tab)).toBe(false);
    rememberRevealed(LAYL.id, tab);
    expect(revealedThisVisit(LAYL.id, tab)).toBe(true);
    expect(revealedThisVisit('another-perfume', tab)).toBe(false);
    // The tab's session holds it, so a reload in the same visit remembers it too.
    forgetVisitMemory();
    expect(revealedThisVisit(LAYL.id, tab)).toBe(true);
  });

  it('keeps to the page’s own memory when the browser refuses to store it', () => {
    const refusing: VisitStore = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(() => rememberRevealed(LAYL.id, refusing)).not.toThrow();
    expect(revealedThisVisit(LAYL.id, refusing)).toBe(true);
    expect(revealedThisVisit(LAYL.id, null)).toBe(true);
  });

  it('never grows without end', () => {
    const tab = store();
    for (let i = 0; i < 250; i++) rememberRevealed(`perfume-${i}`, tab);
    const kept = JSON.parse(tab.saved.get('diyar.revealed')!) as string[];
    expect(kept).toHaveLength(200);
    expect(kept.at(-1)).toBe('perfume-249');
  });
});
