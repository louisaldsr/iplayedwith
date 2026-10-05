'use client'

import { useEffect, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailyStats as Stats, formatScoreBucket } from '../../domain/dailyScore'
import { getDailyStats } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
  /** A heading of its own — the menu's dialog names each sport; the results already say which. */
  heading?: string
}

/**
 * This visitor's daily stats in one sport — the Wordle ones: played, win %, streaks, average score,
 * and how the scores fall, today's bar lit.
 *
 * Read from the server, which keeps every result. Decorative: no stored visitor, or a failed
 * request, and the panel is simply absent.
 */
export function DailyStats({ sport, heading }: Props) {
  const t = useTranslations()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    if (!playerId) return
    const controller = new AbortController()
    getDailyStats(sport, playerId, controller.signal)
      .then(setStats)
      .catch(() => {})
    return () => controller.abort()
  }, [sport])

  if (!stats) return null

  const s = t.daily.stats
  const bars = [
    ...stats.distribution.map((count, bucket) => ({
      key: String(bucket),
      label: formatScoreBucket(bucket, t.daily.perfectBucket),
      count,
      today: stats.today === bucket,
    })),
    { key: 'lost', label: s.lost, count: stats.lost, today: stats.today === 'lost' },
  ]
  const widest = Math.max(1, ...bars.map((b) => b.count))

  return (
    <section className="daily-stats" aria-label={heading ?? s.title}>
      <h3 className="daily-stats__heading">{heading ?? s.title}</h3>
      {stats.played === 0 ? (
        <p className="daily-stats__empty">{s.empty}</p>
      ) : (
        <>
          <dl className="daily-stats__numbers">
            {[
              [s.played, String(stats.played)],
              [s.winRate, String(Math.round((stats.won / stats.played) * 100))],
              [s.streak, String(stats.currentStreak)],
              [s.bestStreak, String(stats.bestStreak)],
              [s.average, stats.averageScore === null ? '—' : s.averageValue(stats.averageScore)],
            ].map(([label, value]) => (
              <div key={label} className="daily-stats__number">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="daily-stats__subheading">{s.distribution}</p>
          <ol className="daily-stats__bars">
            {bars.map((b) => (
              <li key={b.key} className={`daily-stats__bar${b.today ? ' daily-stats__bar--today' : ''}`}>
                <span className="daily-stats__bar-label">{b.label}</span>
                <span className="daily-stats__bar-track">
                  <span
                    className={`daily-stats__bar-fill${b.key === 'lost' ? ' daily-stats__bar-fill--lost' : ''}`}
                    style={{ width: `${Math.max(8, (b.count / widest) * 100)}%` }}
                  >
                    {b.count}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
