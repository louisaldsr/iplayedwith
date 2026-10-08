'use client'

import { createContext, useContext } from 'react'
import type { SportId } from '../domain/sport'

const SportContext = createContext<SportId | null>(null)

/**
 * The sport the page is about — set once by `src/app/[sport]/layout.tsx`, so every text under it
 * (`useTranslations`) speaks that sport's words: drivers and constructors in Formula 1.
 */
export function SportProvider({ sport, children }: { sport: SportId; children: React.ReactNode }) {
  return <SportContext.Provider value={sport}>{children}</SportContext.Provider>
}

/** Null outside a sport's pages (the menu, About). */
export function useSportContext(): SportId | null {
  return useContext(SportContext)
}
