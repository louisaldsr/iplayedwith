'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SPORTS, SportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'
import { useRules } from '../rules/RulesProvider'
import { sportsDoneToday } from '../../lib/dailyProgress'

const SPORT_ICONS: Record<SportId, string> = { rugby: '🏉', football: '⚽' }

/**
 * The home screen, as the game's main menu.
 *
 * The sports own the middle of the screen — each card opens that sport's daily challenge, which is
 * the game. A sport whose challenge is already won today turns green, nudging towards the others.
 * Everything else sits at the bottom: free play (open to everyone), the rules, About, and the
 * features that need an identity (ranking, stats, accounts), listed as "soon".
 */
export function HomeMenu() {
  const t = useTranslations()
  const { openRules } = useRules()
  // Read after mount: storage does not exist on the server, and guessing would flash a colour.
  const [done, setDone] = useState<Set<SportId>>(new Set())
  useEffect(() => setDone(sportsDoneToday()), [])

  return (
    <nav className="home-screen" aria-label={t.menu.label}>
      <header className="home-screen__header">
        <h1 className="home-screen__title">{t.home.title}</h1>
        <p className="home-screen__tagline">{t.home.tagline}</p>
      </header>

      <div className="home-screen__sports">
        {SPORTS.map((sport) => {
          const isDone = done.has(sport)
          return (
            <Link
              key={sport}
              href={`/${sport}`}
              className={`home-screen__sport-card${isDone ? ' home-screen__sport-card--done' : ''}`}
              aria-label={`${t.home.sports[sport]} — ${t.menu.daily}${isDone ? ` (${t.menu.doneToday})` : ''}`}
            >
              {isDone && (
                <span className="home-screen__sport-done" aria-hidden="true">
                  ✓
                </span>
              )}
              <span className="home-screen__sport-icon" aria-hidden="true">
                {SPORT_ICONS[sport]}
              </span>
              <span className="home-screen__sport-name">{t.home.sports[sport]}</span>
            </Link>
          )
        })}
      </div>

      <footer className="home-menu__footer">
        <p className="home-menu__free-play">
          {t.menu.freePlay}{' '}
          {SPORTS.map((sport, i) => (
            <span key={sport}>
              {i > 0 && ' · '}
              <Link href={`/${sport}/free`} aria-label={`${t.home.sports[sport]} — ${t.daily.freePlay}`}>
                {t.home.sports[sport]}
              </Link>
            </span>
          ))}
        </p>

        <div className="home-menu__links">
          <button type="button" className="btn btn--ghost" onClick={openRules}>
            {t.rules.openLabel}
          </button>
          <Link href="/about" className="btn btn--ghost">
            {t.menu.about}
          </Link>
        </div>

        <ul className="home-menu__soon" aria-label={t.menu.soon}>
          {[t.menu.ranking, t.menu.stats, t.menu.logIn].map((label) => (
            <li key={label} aria-disabled="true">
              {label} <span className="home-menu__soon-badge">{t.menu.soon}</span>
            </li>
          ))}
        </ul>
      </footer>
    </nav>
  )
}
