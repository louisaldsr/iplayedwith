'use client'

import { useEffect, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailyLeaderboard } from '../../domain/dailyLeaderboard'
import { formatScore } from '../../domain/dailyScore'
import { formatUsername } from '../../domain/visitorName'
import { getDailyLeaderboard } from '../../lib/gameApi'
import { formatTime } from '../../lib/formatTime'
import { readVisitor } from '../../lib/visitor'
import { challengeDayOf } from '../../domain/dailyChallenge'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
  /** The challenge's day; today when left out. A past one, from the archive, says so in its wording. */
  day?: string
  /** Shown above the ranking; `false` for none — the menu's dialog says it in its title. */
  heading?: string | false
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

/**
 * A day's ranking in one sport — today's, or a past day's from the archive — kept short: the podium — the first three winners, by score then
 * time — and the visitor's own place among everyone who finished. A loser never stands on the
 * podium, but gets a place all the same: the one every loser shares.
 *
 * Read from the server (`POST /api/:sport/daily/ranking`), which never sends another visitor's id
 * or a winning chain. Decorative: if the request fails, the panel is simply absent.
 */
export function DailyRanking({ sport, day, heading }: Props) {
  const t = useTranslations()
  const [board, setBoard] = useState<DailyLeaderboard | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    const controller = new AbortController()
    getDailyLeaderboard(sport, playerId, day, controller.signal)
      .then(setBoard)
      .catch(() => {})
    return () => controller.abort()
  }, [sport, day])

  if (!board) return null

  // The server's day, as it answered: "today" only when it is.
  const r = board.day === challengeDayOf(new Date()) ? t.daily.ranking : { ...t.daily.ranking, ...t.archive.ranking }
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
                  {entry.late && <span className="daily-ranking__late">{t.archive.late}</span>}
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
        {/* Won or lost, the same line: a loser's rank is the one every loser shares, after the winners. */}
        {you ? (
          <>
            <span className="daily-ranking__place-label">{r.yourRank}</span>
            <strong className="daily-ranking__place-value">{r.place(you.rank, total)}</strong>
            {you.late && you.outcome === 'won' && <span className="daily-ranking__late">{t.archive.late}</span>}
          </>
        ) : (
          r.unfinished(total)
        )}
      </p>
    </section>
  )
}
