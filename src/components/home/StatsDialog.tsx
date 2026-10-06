'use client'

import { KeyboardEvent, useRef, useState } from 'react'
import { SPORTS, SportId } from '../../domain/sport'
import { formatUsername } from '../../domain/visitorName'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { DailyStats } from '../daily/DailyStats'
import { useUsername } from '../shared/useUsername'

type Props = {
  open: boolean
  onClose: () => void
  icons: Record<SportId, string>
}

/**
 * The menu's "My stats": whose stats they are first — the visitor's username — then one tab per
 * sport.
 *
 * The content is mounted only while open: the name is read fresh (after a rename from the badge)
 * and the stats are fetched when asked for. Every sport's panel is fetched at once and kept, so
 * switching tabs is instant.
 */
export function StatsDialog({ open, onClose, icons }: Props) {
  const t = useTranslations()
  return (
    <Modal open={open} onClose={onClose} labelledBy="stats-title" className="stats-dialog">
      {open && <StatsContent icons={icons} />}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.daily.close}
      </button>
    </Modal>
  )
}

function StatsContent({ icons }: { icons: Record<SportId, string> }) {
  const t = useTranslations()
  const { username } = useUsername()
  const [active, setActive] = useState<SportId>(SPORTS[0])
  const tabs = useRef(new Map<SportId, HTMLButtonElement>())

  // Arrow keys move between tabs, Home/End jump to the ends (WAI-ARIA tabs pattern).
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
      <h2 id="stats-title" className="stats-dialog__title">
        <span className="stats-dialog__eyebrow">{t.daily.stats.title}</span>
        {username && <span className="stats-dialog__name">{formatUsername(username, t.visitorNames)}</span>}
      </h2>

      <div className="stats-dialog__tabs" role="tablist" aria-label={t.daily.stats.sports} onKeyDown={onKeyDown}>
        {SPORTS.map((sport) => (
          <button
            key={sport}
            ref={(el) => {
              if (el) tabs.current.set(sport, el)
            }}
            type="button"
            role="tab"
            id={`stats-tab-${sport}`}
            aria-selected={sport === active}
            aria-controls={`stats-panel-${sport}`}
            tabIndex={sport === active ? 0 : -1}
            className="stats-dialog__tab"
            onClick={() => setActive(sport)}
          >
            <span aria-hidden="true">{icons[sport]}</span> {t.home.sports[sport]}
          </button>
        ))}
      </div>

      {SPORTS.map((sport) => (
        <div
          key={sport}
          role="tabpanel"
          id={`stats-panel-${sport}`}
          aria-labelledby={`stats-tab-${sport}`}
          hidden={sport !== active}
          className="stats-dialog__panel"
        >
          <DailyStats sport={sport} heading={false} />
        </div>
      ))}
    </>
  )
}
