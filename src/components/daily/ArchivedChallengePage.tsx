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
  day: string
}

/**
 * `/[sport]/archive/[day]`: a past daily, played late — the same game as today's, its result counted
 * in the stats and that day's ranking, marked late.
 *
 * The pair comes from the archive, with what the server already recorded for this visitor: a day
 * finished elsewhere (another browser) opens on its end screen instead of being replayed. Today's
 * day goes to its own page; a future or unknown one is "no challenge that day".
 */
export function ArchivedChallengePage({ sport, day }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const load = useDailyArchive(sport)

  const isToday = load.status === 'ready' && load.archive.today === day
  useEffect(() => {
    if (isToday) router.replace(`/${sport}`)
  }, [isToday, router, sport])

  const mode = useMemo<GameMode | null>(() => {
    const entry = load.status === 'ready' ? load.archive.days.find((d) => d.day === day) : undefined
    if (!entry) return null
    const { result, ...challenge } = entry
    return { kind: 'daily', challenge, archived: result }
  }, [load, day])
  if (mode && !isToday) return <GamePage sport={sport} mode={mode} />

  const missing = load.status === 'ready' && !isToday
  return (
    <div className="game-page">
      <p className={`game-page__status${load.status === 'error' ? ' game-page__status--error' : ''}`}>
        {load.status === 'error' ? t.common.loadError : missing ? t.archive.notFound : t.common.loading}
      </p>
      {missing && (
        <Link href={`/${sport}/archive`} className="daily-intro__free-play">
          {t.archive.back}
        </Link>
      )}
    </div>
  )
}
