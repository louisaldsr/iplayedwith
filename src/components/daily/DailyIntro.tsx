'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { Player } from '../../domain/player'
import { useTranslations } from '../../i18n'
import { PlayerCareerDialog } from '../shared/PlayerCareerDialog'
import { formatDay } from '../../lib/formatDay'
import { formatScore, scoreBucketOf } from '../../domain/dailyScore'

/** A day already over in this browser: how it went, where Start would be. */
export type DailyIntroDone = {
  outcome: 'won' | 'lost'
  /** Won days: the extra players (`dailyScore`). */
  score: number | null
  /** Played late, from the archive: told greyed, like everywhere else. */
  late: boolean
}

type Props = {
  challenge: DailyChallenge
  /** A past day, from the archive: it counts late — in the stats, not the streak nor the day's ranking. */
  archived?: boolean
  /** Starts the day — or, once it is over, opens its board. */
  onStart: () => void
  done?: DailyIntroDone
}

/** "?" drawn between the pair at most — a long day still fits on one line. */
const MAX_MISSING = 4

/** A player of the pair: opens their career, for anyone who does not know them. */
function PlayerButton({ player, onOpen }: { player: Player; onOpen: (p: Player) => void }) {
  const t = useTranslations()
  return (
    <button type="button" className="daily-player" onClick={() => onOpen(player)}>
      {player.nationality && (
        <span className={`fi fi-${player.nationality.toLowerCase()} daily-player__flag`} aria-hidden="true" />
      )}
      <span className="daily-player__name">{player.name}</span>
      <span className="daily-player__hint">{t.daily.viewCareer}</span>
    </button>
  )
}

/**
 * The daily's setup phase: nothing to choose, only the pair to discover before starting.
 *
 * Also what a day already over opens on — the same screen, summed up: the result where the best
 * solution was, "See the board" where Start was, and the sport's other ways to play below.
 */
export function DailyIntro({ challenge, archived = false, onStart, done }: Props) {
  const t = useTranslations()
  const [careerOf, setCareerOf] = useState<Player | null>(null)

  return (
    <div className="daily-intro">
      <header className="daily-intro__header">
        <h1 className="daily-intro__title">
          {archived ? t.archive.title : t.daily.title} <span className="daily-intro__number">#{challenge.number}</span>
        </h1>
        <p className="daily-intro__date">{formatDay(challenge.day, archived)}</p>
        {archived && <p className="daily-intro__late">{t.archive.lateNote}</p>}
      </header>

      {/* Not a match-up: two players to connect. The line between them holds one "?" per player
          the best solution needs — the gap to fill, as the board will draw it. */}
      <div className="daily-intro__players">
        <PlayerButton player={challenge.playerA} onOpen={setCareerOf} />
        <span className="daily-intro__link" aria-hidden="true">
          {Array.from({ length: Math.min(challenge.optimalLinks - 1, MAX_MISSING) }, (_, i) => (
            <span key={i} className="daily-intro__missing">
              ?
            </span>
          ))}
        </span>
        <PlayerButton player={challenge.playerB} onOpen={setCareerOf} />
      </div>

      {done ? (
        <DoneSummary done={done} between={challenge.optimalLinks - 1} />
      ) : (
        // Players in between, never "links": the score counts players too. Always 1 or more (a pair is ≥ 2 links).
        <p className="daily-intro__best">
          {t.daily.bestSolution} <strong>{challenge.optimalLinks - 1}</strong>{' '}
          {t.daily.playersBetween(challenge.optimalLinks - 1)}
        </p>
      )}

      <button type="button" className="btn btn--primary btn--lg daily-intro__start" onClick={onStart}>
        {done ? t.victory.viewBoard : t.daily.start}
      </button>

      {/* The sport's other ways to play, offered here rather than in the menu — at the bottom of the page. */}
      <nav className="daily-intro__more" aria-label={t.daily.more.label}>
        <Link href={`/${challenge.sport}/free`} className="daily-intro__more-link">
          <span className="daily-intro__more-title">{t.daily.freePlay}</span>
          <span className="daily-intro__more-hint">{t.daily.more.freePlayHint}</span>
        </Link>
        <Link href={`/${challenge.sport}/archive`} className="daily-intro__more-link">
          <span className="daily-intro__more-title">{archived ? t.archive.back : t.archive.link}</span>
          <span className="daily-intro__more-hint">{t.daily.more.archiveHint}</span>
        </Link>
      </nav>

      <PlayerCareerDialog player={careerOf} onClose={() => setCareerOf(null)} />
    </div>
  )
}

/** How a day over went: the score in its stats colour, or the lives run out. */
function DoneSummary({ done, between }: { done: DailyIntroDone; between: number }) {
  const t = useTranslations()
  const won = done.outcome === 'won' && done.score !== null
  const tone = won ? `b${scoreBucketOf(done.score!)}` : 'lost'
  return (
    <div className={`daily-intro__done daily-intro__done--${tone}${done.late ? ' daily-intro__done--late' : ''}`}>
      <span className="daily-intro__done-title">
        {won ? (done.late ? t.archive.wonLate : t.daily.wonTitle) : t.daily.lostTitle}
      </span>
      <span className="daily-intro__done-score">{won ? formatScore(done.score!, t.daily.perfect) : '✕'}</span>
      <span className="daily-intro__done-hint">{won ? t.daily.scoreHint(done.score!) : t.daily.lostText(between)}</span>
    </div>
  )
}
