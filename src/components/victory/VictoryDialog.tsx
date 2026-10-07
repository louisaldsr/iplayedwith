'use client'

import Link from 'next/link'
import { Player } from '../../domain/player'
import { Game } from '../../game/game'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { Heart } from '../game/LivesBar'
import { DailyStats } from '../daily/DailyStats'
import { DailyRanking } from '../daily/DailyRanking'
import { SportId } from '../../domain/sport'
import { dailyScore, formatScore } from '../../domain/dailyScore'
import { formatTime } from '../../lib/formatTime'
import { ShareButton } from '../daily/ShareButton'

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
  /** Daily only: whose stats are shown under the results. */
  daily?: { sport: SportId; day: string }
  /** Daily only: played late, from the archive — the win is told, greyed: it is not the real thing. */
  late?: boolean
  /** Daily only: closes the results and lays the proposed solution over the board. */
  onShowSolution?: () => void
  /** Daily only: the message the result is shared with. */
  shareText?: string
  /** Free play restarts in place; the daily has one pair a day, so it offers free play instead. */
  onPlayAgain?: () => void
  freePlayHref?: string
  /** Daily only: the sport's past challenges, still to play. */
  archiveHref?: string
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
  late = false,
  onShowSolution,
  shareText,
  onPlayAgain,
  freePlayHref,
  archiveHref,
}: Props) {
  const t = useTranslations()
  const playerMap = new Map(players.map((p) => [p.id as string, p.name]))
  const pathNames = game.path.map((id) => playerMap.get(id) ?? id)
  const score = optimalLinks === undefined ? null : dailyScore(moveCount, optimalLinks)

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="victory-title"
      className={`victory-dialog${late ? ' victory-dialog--late' : ''}`}
    >
      <span className="victory-dialog__trophy" aria-hidden="true">
        🏆
      </span>
      <h2 id="victory-title" className="victory-dialog__heading">
        {late ? t.archive.wonLate : t.victory.heading}
      </h2>

      {score !== null && (
        <div className="victory-score">
          <span className="victory-score__value">{formatScore(score, t.daily.perfect)}</span>
          <span className="victory-score__hint">{t.daily.scoreHint(score)}</span>
          {/* Right under the comparison: the shortest chain it is measured against. */}
          {onShowSolution && (
            <button
              type="button"
              className="btn btn--solution btn--sm victory-score__solution"
              onClick={onShowSolution}
            >
              {t.daily.solution.show}
            </button>
          )}
          {shareText && <ShareButton text={shareText} className="victory-score__share" />}
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

      {daily && <DailyRanking sport={daily.sport} day={daily.day} />}
      {daily && <DailyStats sport={daily.sport} />}

      {/* Game, ranking, stats, then what to do next — each part set apart. */}
      <hr className="victory-dialog__divider" />

      <div className="victory-dialog__actions">
        <button type="button" className="btn btn--primary victory-dialog__main" onClick={onClose}>
          {t.victory.viewBoard}
        </button>
        <div className="victory-dialog__more">
          {onPlayAgain && (
            <button type="button" className="btn btn--ghost btn--lg" onClick={onPlayAgain}>
              {t.victory.playAgain}
            </button>
          )}
          {archiveHref && (
            <Link href={archiveHref} className="btn btn--ghost btn--lg">
              {t.archive.link}
            </Link>
          )}
          {freePlayHref && (
            <Link href={freePlayHref} className="btn btn--ghost btn--lg">
              {t.daily.freePlay}
            </Link>
          )}
        </div>
      </div>
    </Modal>
  )
}
