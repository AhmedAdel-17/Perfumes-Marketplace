import { describe, expect, it } from 'vitest';
import { directionOf, isEnglishPath, localePath, stripLocale } from './locale';
import { defineMessages } from './messages';
import { countedIn, NOUN } from './plural';
import { data, editorial, editorialIn } from './numerals';

describe('locale paths', () => {
  it('keeps Arabic on the unprefixed URLs, so links already shared keep working', () => {
    expect(localePath('ar', '/houses')).toBe('/houses');
    expect(localePath('ar', '/en/houses')).toBe('/houses');
    expect(localePath('ar', '/en')).toBe('/');
  });

  it('puts English under /en, including the home page and query strings', () => {
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('en', '/p/layl')).toBe('/en/p/layl');
    expect(localePath('en', '/search?q=oud')).toBe('/en/search?q=oud');
    expect(localePath('en', '/?x=1')).toBe('/en?x=1');
    expect(localePath('en', '/en/houses')).toBe('/en/houses');
  });

  it('leaves links out of the site alone', () => {
    expect(localePath('en', 'https://instagram.com/x')).toBe('https://instagram.com/x');
    expect(localePath('en', '//cdn.example/x')).toBe('//cdn.example/x');
  });

  it('does not mistake a path that merely starts with "en" for English', () => {
    expect(isEnglishPath('/enquiries')).toBe(false);
    expect(stripLocale('/enquiries')).toBe('/enquiries');
    expect(stripLocale('/en?q=1')).toBe('/?q=1');
  });

  it('knows each direction', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});

describe('counted nouns in English', () => {
  it('leads with the number and inflects one against many', () => {
    expect(countedIn('en', 1, NOUN.perfume, data)).toBe('1 perfume');
    expect(countedIn('en', 3, NOUN.perfume, data)).toBe('3 perfumes');
    expect(countedIn('en', 0, NOUN.perfume, data)).toBe('No perfumes');
  });

  it('leaves Arabic to its own six forms', () => {
    expect(countedIn('ar', 2, NOUN.perfume, editorial)).toBe('عطران');
    expect(countedIn('ar', 3, NOUN.perfume, editorial)).toBe('٣ عطور');
  });

  it('never sets Arabic-Indic digits on the English site', () => {
    expect(editorialIn('en')(42)).toBe('42');
    expect(editorialIn('ar')(42)).toBe('٤٢');
  });
});

describe('message catalogues', () => {
  it('refuses an English catalogue that is missing a key', () => {
    // @ts-expect-error — `en` lacks `body`, which must be a compile error.
    defineMessages({ title: 'عنوان', body: 'نص' }, { title: 'Title' });
  });

  it('refuses a function message translated as a plain string', () => {
    // @ts-expect-error — a message that takes a count must stay a function.
    defineMessages({ count: (n: string) => `${n} عطور` }, { count: 'perfumes' });
  });
});
