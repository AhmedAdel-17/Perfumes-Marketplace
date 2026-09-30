'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@diyar/i18n';

/**
 * The page's language, for client components.
 *
 * Set once by the root layout from the value middleware derived from the URL.
 * A context rather than a prop threaded through every component: nearly every
 * client component renders words, and passing `locale` down five levels is how
 * one forgotten prop leaves a single button in the wrong language.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);

