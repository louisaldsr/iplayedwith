'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { DailyOutcome } from '../../lib/dailyProgress'
import { Game } from '../../game/game'
import { playerKey } from '../../game/graphBuilder'
import { useTranslations } from '../../i18n'
import { DailyStats } from './DailyStats'
import { DailyRanking } from './DailyRanking'
import { GameBoard } from '../game/GameBoard'
import { SolutionOverlay } from './SolutionOverlay'
import { useDailySolution } from './useDailySolution'

type Props = {
  challenge: DailyChallenge
  outcome: DailyOutcome
  livesLeft: number
}

/**
 * The daily once it is over — straight after the last life is lost, or when coming back to a day
 * already won or lost. One pair a day: what is left to play is the archive's past days.
 *
 * Only for a day without a board to show — lost before lost boards were kept, or won before won
 * ones were. Otherwise the board stays, and the proposed solution is laid over it.
 *
 * The visitor's own tree of that day is gone (the browser dropped it, the server never had it), so
 * the board shows A and B alone, the "Proposed Solution" checkbox on top of it.
 */
export function DailyFinished({ challenge, outcome, livesLeft }: Props) {
  const t = useTranslations()
  const won = outcome === 'won'
  const day = useMemo(() => ({ sport: challenge.sport, day: challenge.day }), [challenge])
  const solution = useDailySolution(day)
  const board = useMemo<Game>(
    () => ({
      playerA: challenge.playerA,
      playerB: challenge.playerB,
      difficulty: 'easy',
      nodes: new Map(
        [challenge.playerA, challenge.playerB].map((p) => [playerKey(p.id), { kind: 'player', id: p.id }]),
      ),
      edges: [],
      path: [],
      startedAt: new Date(),
    }),
    [challenge],
  )

  return (
    <div className={`daily-finished daily-finished--${outcome}`}>
      <span className="daily-finished__icon" aria-hidden="true">
        {won ? '🏆' : '💔'}
      </span>
      <h1 className="daily-finished__title">{won ? t.daily.wonTitle : t.daily.lostTitle}</h1>
      <p className="daily-finished__subtitle">
        {t.daily.title} #{challenge.number} — {challenge.playerA.name} {t.daily.versus} {challenge.playerB.name}
      </p>
      <p className="daily-finished__text">
        {won ? t.daily.wonText(livesLeft) : t.daily.lostText(challenge.optimalLinks)}
      </p>
      <div className="daily-finished__board">
        <GameBoard
          game={board}
          players={[challenge.playerA, challenge.playerB]}
          clubs={[]}
          solution={solution.shown ?? undefined}
        />
        <SolutionOverlay solution={solution} />
      </div>
      <p className="daily-finished__note">{t.daily.boardNotKept}</p>
      <p className="daily-finished__tomorrow">{t.daily.comeBackTomorrow}</p>
      <DailyRanking sport={challenge.sport} />
      <DailyStats sport={challenge.sport} />
      <div className="daily-finished__actions">
        <Link href={`/${challenge.sport}/free`} className="btn btn--primary">
          {t.daily.freePlay}
        </Link>
        <Link href={`/${challenge.sport}/archive`} className="btn btn--ghost">
          {t.archive.link}
        </Link>
        <Link href="/" className="btn btn--ghost">
          {t.about.back}
        </Link>
      </div>
    </div>
  )
}
