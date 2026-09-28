'use client'

import { useEffect, useState } from 'react'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { SportId } from '../../domain/sport'
import { getDailyChallenge } from '../../lib/gameApi'
import { useTranslations } from '../../i18n'
import { GamePage } from '../GamePage'

type Props = {
  sport: SportId
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; challenge: DailyChallenge }

/**
 * Entry point of `/[sport]`: loads today's pair, then hands it to the regular game shell.
 *
 * One small request — two players and a number. The first visitor of the day also triggers
 * the draw on the server.
 */
export function DailyChallengePage({ sport }: Props) {
  const t = useTranslations()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    getDailyChallenge(sport, controller.signal)
      .then((challenge) => setLoad({ status: 'ready', challenge }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      })
    return () => controller.abort()
  }, [sport])

  if (load.status === 'ready') {
    return <GamePage sport={sport} mode={{ kind: 'daily', challenge: load.challenge }} />
  }

  return (
    <div className="game-page">
      <p className={`game-page__status${load.status === 'error' ? ' game-page__status--error' : ''}`}>
        {load.status === 'error' ? t.common.loadError : t.common.loading}
      </p>
    </div>
  )
}
