'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Player } from '../../domain/player'
import { Game } from '../../game/game'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { Heart } from '../game/LivesBar'
import { DailyStats } from '../daily/DailyStats'
import { DailySolution } from '../daily/DailySolution'
import { SportId } from '../../domain/sport'
import { dailyScore, formatScore } from '../../domain/dailyScore'

type Props = {
  open: boolean
  /** Closing leaves the board on screen, its winning chain lit — the pop-up never navigates away. */
  onClose: () => void
  game: Game
  players: Player[]
  moveCount: number
  /** Frozen at the winning move, so reopening the results later shows the same time. */
  elapsedMs: number
  /** Daily only: the shortest chain possible — the score counts the players added beyond it. */
  optimalLinks?: number
  /** Daily only: the lives the win was achieved with. */
  lives?: { left: number; total: number }
  /** Daily only: whose stats and solution are shown under the results. */
  daily?: { sport: SportId; day: string }
  /** Free play restarts in place; the daily has one pair a day, so it offers free play instead. */
  onPlayAgain?: () => void
  freePlayHref?: string
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The results of a won game, over the board. It opens on the winning move and closes by its button,
 * Escape or the backdrop — the board stays underneath, to be enjoyed, and the results can be
 * reopened from the bar below it.
 */
export function VictoryDialog({
  open,
  onClose,
  game,
  players,
  moveCount,
  elapsedMs,
  optimalLinks,
  lives,
  daily,
  onPlayAgain,
  freePlayHref,
}: Props) {
  const t = useTranslations()
  const [solutionOpen, setSolutionOpen] = useState(false)
  const playerMap = new Map(players.map((p) => [p.id as string, p.name]))
  const pathNames = game.path.map((id) => playerMap.get(id) ?? id)
  const score = optimalLinks === undefined ? null : dailyScore(moveCount, optimalLinks)

  return (
    <Modal open={open} onClose={onClose} labelledBy="victory-title" className="victory-dialog">
      <span className="victory-dialog__trophy" aria-hidden="true">
        🏆
      </span>
      <h2 id="victory-title" className="victory-dialog__heading">
        {t.victory.heading}
      </h2>

      {score !== null && (
        <div className="victory-score">
          <span className="victory-score__value">{formatScore(score, t.daily.perfect)}</span>
          <span className="victory-score__hint">{t.daily.scoreHint(score)}</span>
        </div>
      )}

      <div className="victory-path">
        {pathNames.map((name, i) => (
          <span key={i}>
            {i > 0 && <span className="victory-path__separator"> → </span>}
            <span className="victory-path__player">{name}</span>
          </span>
        ))}
      </div>

      {/* The daily's score already says the chain, the best possible and the moves in one word. */}
      <div className="victory-stats">
        {score === null && (
          <div className="victory-stat">
            <span className="stat-label">{t.victory.moves}</span>
            <span className="stat-value">{moveCount}</span>
          </div>
        )}
        <div className="victory-stat">
          <span className="stat-label">{t.victory.time}</span>
          <span className="stat-value">{formatTime(elapsedMs)}</span>
        </div>
        {lives && (
          <div className="victory-stat">
            <span className="stat-label">{t.daily.lives}</span>
            <span className="victory-stat__hearts" role="img" aria-label={t.daily.livesLeft(lives.left, lives.total)}>
              {Array.from({ length: lives.total }, (_, i) => (
                <span key={i} className={`heart${i < lives.left ? '' : ' heart--empty'}`}>
                  <Heart full={i < lives.left} />
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {daily && (
        <details className="daily-solution-toggle" onToggle={(e) => setSolutionOpen(e.currentTarget.open)}>
          <summary>{t.daily.solution.show}</summary>
          {/* Fetched when opened: most winners never ask. */}
          {solutionOpen && <DailySolution sport={daily.sport} day={daily.day} />}
        </details>
      )}

      {daily && <DailyStats sport={daily.sport} />}

      <div className="victory-dialog__actions">
        <button type="button" className="btn btn--ghost btn--lg" onClick={onClose}>
          {t.victory.viewBoard}
        </button>
        {onPlayAgain && (
          <button type="button" className="btn btn--primary btn--lg" onClick={onPlayAgain}>
            {t.victory.playAgain}
          </button>
        )}
        {freePlayHref && (
          <Link href={freePlayHref} className="btn btn--primary btn--lg">
            {t.daily.freePlay}
          </Link>
        )}
      </div>
    </Modal>
  )
}
