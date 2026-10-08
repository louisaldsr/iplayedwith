'use client'

import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { SPORTS, SportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'

type Props = {
  /** Prefixes the tab and panel ids — one per dialog, so two never clash. */
  idPrefix: string
  /** Names the tab list for screen readers. */
  label: string
  icons: Record<SportId, string>
  children: (sport: SportId) => ReactNode
}

/**
 * One tab per sport, for the menu's dialogs (My stats, Ranking). WAI-ARIA tabs pattern: arrow keys
 * move between tabs, Home/End jump to the ends.
 *
 * Every panel is rendered at once and only hidden: whatever a panel fetches is fetched on open and
 * kept, so switching tabs is instant.
 *
 * On a phone, only the selected tab spells its sport out — the others show their icon (the name
 * stays for screen readers) — and the row scrolls sideways once the sports outgrow it.
 */
export function SportTabs({ idPrefix, label, icons, children }: Props) {
  const t = useTranslations()
  const [active, setActive] = useState<SportId>(SPORTS[0])
  const tabs = useRef(new Map<SportId, HTMLButtonElement>())

  useEffect(() => {
    // Absent from jsdom.
    tabs.current.get(active)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  const onKeyDown = (e: KeyboardEvent) => {
    const i = SPORTS.indexOf(active)
    const next =
      e.key === 'ArrowRight'
        ? SPORTS[(i + 1) % SPORTS.length]
        : e.key === 'ArrowLeft'
          ? SPORTS[(i - 1 + SPORTS.length) % SPORTS.length]
          : e.key === 'Home'
            ? SPORTS[0]
            : e.key === 'End'
              ? SPORTS[SPORTS.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    setActive(next)
    tabs.current.get(next)?.focus()
  }

  return (
    <>
      <div className="sport-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {SPORTS.map((sport) => (
          <button
            key={sport}
            ref={(el) => {
              if (el) tabs.current.set(sport, el)
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${sport}`}
            aria-selected={sport === active}
            aria-controls={`${idPrefix}-panel-${sport}`}
            tabIndex={sport === active ? 0 : -1}
            className="sport-tabs__tab"
            onClick={() => setActive(sport)}
          >
            <span aria-hidden="true">{icons[sport]}</span>{' '}
            <span className="sport-tabs__label">{t.home.sports[sport]}</span>
          </button>
        ))}
      </div>

      {SPORTS.map((sport) => (
        <div
          key={sport}
          role="tabpanel"
          id={`${idPrefix}-panel-${sport}`}
          aria-labelledby={`${idPrefix}-tab-${sport}`}
          hidden={sport !== active}
          className="sport-tabs__panel"
        >
          {children(sport)}
        </div>
      ))}
    </>
  )
}
