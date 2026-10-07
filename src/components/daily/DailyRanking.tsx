'use client'

import { useEffect, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailyLeaderboard } from '../../domain/dailyLeaderboard'
import { formatScore } from '../../domain/dailyScore'
import { formatUsername } from '../../domain/visitorName'
import { getDailyLeaderboard } from '../../lib/gameApi'
import { formatTime } from '../../lib/formatTime'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
  /** Shown above the ranking; `false` for none — the menu's dialog says it in its title. */
  heading?: string | false
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

/**
 * Today's ranking in one sport, kept short: the podium — the first three winners, by score then
 * time — and the visitor's own place among everyone who finished.
 *
 * Read from the server (`POST /api/:sport/daily/ranking`), which never sends another visitor's id
 * or a winning chain. Decorative: if the request fails, the panel is simply absent.
 */
export function DailyRanking({ sport, heading }: Props) {
  const t = useTranslations()
  const [board, setBoard] = useState<DailyLeaderboard | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    const controller = new AbortController()
    getDailyLeaderboard(sport, playerId, controller.signal)
      .then(setBoard)
      .catch(() => {})
    return () => controller.abort()
  }, [sport])

  if (!board) return null

  const r = t.daily.ranking
  const title = heading === undefined ? r.title : heading
  const { you, total } = board

  return (
    <section className="daily-ranking" aria-label={title || r.title}>
      {title && <h3 className="daily-ranking__heading">{title}</h3>}

      {board.podium.length === 0 ? (
        <p className="daily-ranking__empty">{r.noWinner(total)}</p>
      ) : (
        <ol className="daily-ranking__podium" aria-label={r.podium}>
          {board.podium.map((entry, i) => {
            const classes = ['daily-ranking__entry', `daily-ranking__entry--${Math.min(entry.rank, 4)}`]
            if (entry.you) classes.push('daily-ranking__entry--you')
            return (
              <li key={i} className={classes.join(' ')}>
                <span className="daily-ranking__medal">
                  <span aria-hidden="true">{MEDALS[entry.rank] ?? entry.rank}</span>
                  <span className="visually-hidden">{entry.rank}.</span>
                </span>
                <span className="daily-ranking__name">
                  {entry.username ? formatUsername(entry.username, t.visitorNames) : r.anonymous}
                  {entry.you && <span className="daily-ranking__you">{r.you}</span>}
                </span>
                <span className="daily-ranking__score">{formatScore(entry.score, t.daily.perfectBucket)}</span>
                <span className="daily-ranking__time">{formatTime(entry.durationMs)}</span>
              </li>
            )
          })}
        </ol>
      )}

      <p className={`daily-ranking__place${you ? ` daily-ranking__place--${you.outcome}` : ''}`}>
        {you?.outcome === 'won' ? (
          <>
            <span className="daily-ranking__place-label">{r.yourRank}</span>
            <strong className="daily-ranking__place-value">{r.place(you.rank, total)}</strong>
          </>
        ) : you ? (
          r.failed(total)
        ) : (
          r.unfinished(total)
        )}
      </p>
    </section>
  )
}
