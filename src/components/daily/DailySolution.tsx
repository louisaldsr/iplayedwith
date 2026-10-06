'use client'

import { useEffect, useState } from 'react'
import { SportId } from '../../domain/sport'
import { DailySolution as Solution } from '../../domain/dailySolution'
import { getDailySolution } from '../../lib/gameApi'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
  day: string
}

/**
 * The day's stored solution, once the day is over: ONE shortest chain — said so, since others of
 * the same length may exist — each link with the club and season the two players shared.
 *
 * The server hands it out only to a visitor it recorded as finished. Decorative: refused, failed
 * or without a stored visitor, the panel is simply absent.
 */
export function DailySolution({ sport, day }: Props) {
  const t = useTranslations()
  const [solution, setSolution] = useState<Solution | null>(null)

  useEffect(() => {
    const { playerId } = readVisitor()
    if (!playerId) return
    const controller = new AbortController()
    getDailySolution(sport, day, playerId, controller.signal)
      .then(setSolution)
      .catch(() => {})
    return () => controller.abort()
  }, [sport, day])

  if (!solution) return null

  const s = t.daily.solution
  const last = solution.players.length - 1
  return (
    <section className="daily-solution" aria-label={s.title}>
      <h3 className="daily-solution__title">{s.title}</h3>
      <p className="daily-solution__note">{s.note(solution.links.length)}</p>
      <ol className="daily-solution__chain">
        {solution.players.map((player, i) => (
          <li key={player.id} className="daily-solution__step">
            <span className={`daily-solution__player${i === 0 || i === last ? ' daily-solution__player--end' : ''}`}>
              {player.name}
            </span>
            {i < last && (
              <span className="daily-solution__link">
                {solution.links[i].club.name} · {solution.links[i].season}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
