'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SportId } from '../../domain/sport'
import { useTranslations } from '../../i18n'
import { GamePage, GameMode } from '../GamePage'
import { useDailyArchive } from './DailyArchivePage'

type Props = {
  sport: SportId
} & (
  | { day: string }
  /** A shared link (`/rugby/412`) names its day by number. */
  | { number: number }
)

/**
 * `/[sport]/archive/[day]`: a past daily, played late — the same game as today's, its result counted
 * in the stats and that day's ranking, marked late.
 *
 * The pair comes from the archive, with what the server already recorded for this visitor: a day
 * finished elsewhere (another browser) opens on its end screen instead of being replayed. Today's
 * day goes to its own page; a future or unknown one is "no challenge that day".
 *
 * Also what a shared link opens, its day found by number: a friend plays the day they were sent.
 * There, a day the archive cannot give — not reached yet, or the archive failing — goes to today's
 * challenge instead: a link always leads to a game.
 */
export function ArchivedChallengePage(props: Props) {
  const { sport } = props
  const t = useTranslations()
  const router = useRouter()
  const load = useDailyArchive(sport)

  const entry =
    load.status === 'ready'
      ? load.archive.days.find((d) => ('day' in props ? d.day === props.day : d.number === props.number))
      : undefined
  const isToday = load.status === 'ready' && entry?.day === load.archive.today
  const shared = 'number' in props
  const toToday = isToday || (shared && (load.status === 'error' || (load.status === 'ready' && !entry)))
  useEffect(() => {
    if (toToday) router.replace(`/${sport}`)
  }, [toToday, router, sport])

  const mode = useMemo<GameMode | null>(() => {
    if (!entry) return null
    const { result, ...challenge } = entry
    return { kind: 'daily', challenge, archived: result }
  }, [entry])
  if (mode && !toToday) return <GamePage sport={sport} mode={mode} />

  // While going to today's page, it reads as loading — not as an error or a missing day.
  const failed = load.status === 'error' && !toToday
  const missing = load.status === 'ready' && !toToday
  return (
    <div className="game-page">
      <p className={`game-page__status${failed ? ' game-page__status--error' : ''}`}>
        {failed ? t.common.loadError : missing ? t.archive.notFound : t.common.loading}
      </p>
      {missing && (
        <Link href={`/${sport}/archive`} className="daily-intro__free-play">
          {t.archive.back}
        </Link>
      )}
    </div>
  )
}
