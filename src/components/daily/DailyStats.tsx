'use client'

import { useEffect, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailyStats as Stats, formatScoreBucket } from '../../domain/dailyScore'
import { getDailyStats } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
  /** Shown above the stats; `false` for none — the menu's dialog names the sport in its tabs. */
  heading?: string | false
}

/**
 * This visitor's daily stats in one sport: days played, win rate, and how the scores fall — one
 * bar per score, coloured from gold (Perfect) through green to red (+5 and worse, lost), today's
 * bar tagged.
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
  const title = heading === undefined ? s.title : heading
  const bars = [
    ...stats.distribution.map((count, bucket) => ({
      tone: `b${bucket}`,
      label: formatScoreBucket(bucket, t.daily.perfectBucket),
      count,
      today: stats.today === bucket,
    })),
    { tone: 'lost', label: s.lost, count: stats.lost, today: stats.today === 'lost' },
  ]
  const widest = Math.max(1, ...bars.map((b) => b.count))

  return (
    <section className="daily-stats" aria-label={title || s.title}>
      {title && <h3 className="daily-stats__heading">{title}</h3>}
      {stats.played === 0 ? (
        <p className="daily-stats__empty">{s.empty}</p>
      ) : (
        <>
          <dl className="daily-stats__tiles">
            <div className="daily-stats__tile">
              <dt>{s.played}</dt>
              <dd>{stats.played}</dd>
            </div>
            <div className="daily-stats__tile">
              <dt>{s.winRate}</dt>
              <dd>{s.winRateValue(Math.round((stats.won / stats.played) * 100))}</dd>
            </div>
          </dl>
          <p className="daily-stats__subheading">{s.distribution}</p>
          <ol className="daily-stats__bars">
            {bars.map((b) => {
              const classes = ['daily-stats__bar', `daily-stats__bar--${b.tone}`]
              if (b.count === 0) classes.push('daily-stats__bar--empty')
              if (b.today) classes.push('daily-stats__bar--today')
              return (
                <li key={b.tone} className={classes.join(' ')}>
                  <span className="daily-stats__bar-label">{b.label}</span>
                  <span className="daily-stats__bar-track">
                    <span className="daily-stats__bar-fill" style={{ width: `${(b.count / widest) * 100}%` }}>
                      {b.count}
                    </span>
                    {b.today && <span className="daily-stats__today">{s.today}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
