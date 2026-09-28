'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { markRulesSeen, readVisitor, Visitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'
import { RulesDialog } from './RulesDialog'

type RulesContextValue = {
  /** Opens the rules pop-up. */
  openRules: () => void
  /** Null until mounted: storage only exists in the browser, never during server rendering. */
  visitor: Omit<Visitor, 'rulesSeen'> | null
}

const RulesContext = createContext<RulesContextValue | null>(null)

/**
 * Owns the rules pop-up for the whole app, from the root layout.
 *
 * Lives above every page because a first visit can start anywhere — a shared link lands straight
 * on `/rugby`, skipping the home screen. Whatever page comes first opens the rules once; the "?"
 * button reopens them from every page.
 *
 * Except the back-office: `/admin` is not the game, so it gets neither the button nor the pop-up.
 */
export function RulesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [visitor, setVisitor] = useState<RulesContextValue['visitor']>(null)
  const isAdmin = usePathname()?.startsWith('/admin') ?? false

  // Read after mount, never during render: the server has no storage, so reading it while
  // rendering would make the first client render disagree with the server's HTML.
  //
  // Keyed on `isAdmin`, not run once: landing on /admin first must not count as having been
  // shown the rules, so the pop-up still opens when the game is reached.
  useEffect(() => {
    if (isAdmin) return
    const { rulesSeen, ...rest } = readVisitor()
    setVisitor(rest)
    if (!rulesSeen) setOpen(true)
  }, [isAdmin])

  const openRules = useCallback(() => setOpen(true), [])

  const closeRules = useCallback(() => {
    markRulesSeen()
    setOpen(false)
  }, [])

  const value = useMemo(() => ({ openRules, visitor }), [openRules, visitor])

  return (
    <RulesContext.Provider value={value}>
      {children}
      {!isAdmin && (
        <>
          <button type="button" className="rules-button" aria-label={t.rules.openLabel} onClick={openRules}>
            ?
          </button>
          <RulesDialog open={open} onClose={closeRules} />
        </>
      )}
    </RulesContext.Provider>
  )
}

export function useRules(): RulesContextValue {
  const value = useContext(RulesContext)
  if (!value) throw new Error('useRules must be used inside <RulesProvider>')
  return value
}
