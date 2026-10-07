'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SportId } from '../../domain/sport'
import { DailyArchive, DailyArchiveEntry } from '../../domain/dailyArchive'
import { formatScore, scoreBucketOf } from '../../domain/dailyScore'
import { getDailyArchive } from '../../lib/gameApi'
import { formatDay } from '../../lib/formatDay'
import { readVisitor } from '../../lib/visitor'
import { useTranslations } from '../../i18n'

type Props = {
  sport: SportId
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; archive: DailyArchive }

/** Loads the sport's archive — the days and this visitor's result on each, as the server has them. */
export function useDailyArchive(sport: SportId): Load {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    getDailyArchive(sport, readVisitor().playerId, controller.signal)
      .then((archive) => setLoad({ status: 'ready', archive }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      })
    return () => controller.abort()
  }, [sport])
  return load
}

/** `/[sport]/archive`: every daily challenge since the launch, newest first, each one playable. */
export function DailyArchivePage({ sport }: Props) {
  const t = useTranslations()
  const load = useDailyArchive(sport)

  return (
    <div className="game-page">
      <div className="archive-page">
        <header className="archive-page__header">
          <h1 className="archive-page__title">{t.archive.pageTitle(t.home.sports[sport])}</h1>
          <p className="archive-page__intro">{t.archive.intro}</p>
        </header>

        {load.status !== 'ready' ? (
          <p className={`game-page__status${load.status === 'error' ? ' game-page__status--error' : ''}`}>
            {load.status === 'error' ? t.common.loadError : t.common.loading}
          </p>
        ) : load.archive.days.length === 0 ? (
          <p className="game-page__status">{t.archive.empty}</p>
        ) : (
          <ol className="archive-list">
            {load.archive.days.map((entry) => (
              <li key={entry.day}>
                <ArchiveDay entry={entry} isToday={entry.day === load.archive.today} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** One day: its number, date and pair, and how the visitor did — coloured like the stats' scores. */
function ArchiveDay({ entry, isToday }: { entry: DailyArchiveEntry; isToday: boolean }) {
  const t = useTranslations()
  const { result } = entry

  let tone = 'to-play'
  let status = t.archive.toPlay
  if (result?.outcome === 'won' && result.score !== null) {
    tone = `b${scoreBucketOf(result.score)}`
    status = formatScore(result.score, t.daily.perfect)
  } else if (result?.outcome === 'lost') {
    tone = 'lost'
    status = t.daily.stats.lost
  } else if (result) {
    tone = 'in-progress'
    status = t.archive.inProgress
  }

  // Today's challenge is played where it always is: its own page, on time.
  const href = isToday ? `/${entry.sport}` : `/${entry.sport}/archive/${entry.day}`
  // A finished day is filled with its score's colour; one still to play stays plain, and invites.
  const done = result?.outcome === 'won' || result?.outcome === 'lost'
  return (
    <Link href={href} className={`archive-day archive-day--${tone}${done ? ' archive-day--done' : ''}`}>
      <span className="archive-day__number">#{entry.number}</span>
      <span className="archive-day__main">
        <span className="archive-day__date">
          {isToday ? `${t.archive.today} — ` : ''}
          {formatDay(entry.day, true)}
        </span>
        <span className="archive-day__pair">
          {entry.playerA.name} {t.daily.versus} {entry.playerB.name}
        </span>
      </span>
      <span className="archive-day__result">
        <span className="archive-day__status">
          {tone === 'b0' && <span aria-hidden="true">★ </span>}
          {status}
          {!result && <span aria-hidden="true"> ›</span>}
        </span>
        {result?.late && result.outcome && <span className="archive-day__late">{t.archive.late}</span>}
      </span>
    </Link>
  )
}
