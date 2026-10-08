'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import logo from '../../../brand/logo.svg'
import { SPORTS, SportId, UPCOMING_SPORTS, UpcomingSportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'
import { useRules } from '../rules/RulesProvider'
import { dailyOutcomesToday, DailyOutcome } from '../../lib/dailyProgress'
import { VisitorBadge } from './VisitorBadge'
import { StatsDialog } from './StatsDialog'
import { RankingDialog } from './RankingDialog'

const SPORT_ICONS: Record<SportId, string> = { rugby: '🏉', football: '⚽', basketball: '🏀', formula1: '🏎️' }

const UPCOMING_ICONS: Record<UpcomingSportId, string> = {}

/**
 * The home screen, as the game's main menu.
 *
 * The sports own the middle of the screen — each card opens that sport's daily challenge, which is
 * the game. A sport whose challenge is already over today turns green (won) or red (lost), nudging
 * towards the ones still to play. A sport on its way (UPCOMING_SPORTS) is teased after them: a card
 * that opens nothing, marked "coming soon".
 * Everything else sits at the bottom: the rules, today's ranking, the visitor's stats and About.
 * Free play and the past challenges are a sport's own: they are offered under its daily challenge.
 * No accounts: the anonymous visitor (src/lib/visitor.ts) is enough.
 */
export function HomeMenu() {
  const t = useTranslations()
  const { openRules } = useRules()
  // Read after mount: storage does not exist on the server, and guessing would flash a colour.
  const [outcomes, setOutcomes] = useState<Map<SportId, DailyOutcome>>(new Map())
  useEffect(() => setOutcomes(dailyOutcomesToday()), [])
  const [statsOpen, setStatsOpen] = useState(false)
  const [rankingOpen, setRankingOpen] = useState(false)

  return (
    <nav className="home-screen" aria-label={t.menu.label}>
      <VisitorBadge />
      <header className="home-screen__header">
        {/* Decorative: the title right below says the same thing. */}
        <Image className="home-screen__logo" src={logo} alt="" priority />
        <h1 className="home-screen__title">{t.home.title}</h1>
        <p className="home-screen__tagline">{t.home.tagline}</p>
      </header>

      <div className="home-screen__sports">
        {SPORTS.map((sport) => {
          const outcome = outcomes.get(sport)
          const status = outcome === 'won' ? t.menu.doneToday : outcome === 'lost' ? t.menu.lostToday : null
          return (
            <Link
              key={sport}
              href={`/${sport}`}
              className={`home-screen__sport-card${outcome ? ` home-screen__sport-card--${outcome}` : ''}`}
              aria-label={`${t.home.sports[sport]} — ${t.menu.daily}${status ? ` (${status})` : ''}`}
            >
              {outcome && (
                <span className="home-screen__sport-status" aria-hidden="true">
                  {outcome === 'won' ? '✓' : '✕'}
                </span>
              )}
              <span className="home-screen__sport-icon" aria-hidden="true">
                {SPORT_ICONS[sport]}
              </span>
              <span className="home-screen__sport-name">{t.home.sports[sport]}</span>
            </Link>
          )
        })}
        {UPCOMING_SPORTS.map((sport) => (
          <div key={sport} className="home-screen__sport-card home-screen__sport-card--upcoming">
            <span className="home-screen__sport-icon" aria-hidden="true">
              {UPCOMING_ICONS[sport]}
            </span>
            <span className="home-screen__sport-name">{t.home.upcoming[sport]}</span>
            {/* After the name in reading order; drawn in the corner, where a played sport's ✓ sits. */}
            <span className="home-screen__sport-soon">{t.menu.comingSoon}</span>
          </div>
        ))}
      </div>

      <footer className="home-menu__footer">
        <div className="home-menu__links">
          <button type="button" className="btn btn--ghost" onClick={openRules}>
            {t.rules.openLabel}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setRankingOpen(true)}>
            {t.menu.ranking}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setStatsOpen(true)}>
            {t.menu.stats}
          </button>
          <Link href="/about" className="btn btn--ghost">
            {t.menu.about}
          </Link>
        </div>
      </footer>

      <RankingDialog open={rankingOpen} onClose={() => setRankingOpen(false)} icons={SPORT_ICONS} />
      <StatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} icons={SPORT_ICONS} />
    </nav>
  )
}
