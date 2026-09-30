'use client'

import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { DailyOutcome } from '../../lib/dailyProgress'
import { useTranslations } from '../../i18n'

type Props = {
  challenge: DailyChallenge
  outcome: DailyOutcome
  livesLeft: number
}

/**
 * The daily once it is over — straight after the last life is lost, or when coming back to a day
 * already won or lost. One pair a day: there is nothing left to play until tomorrow.
 *
 * The solution is not shown on a loss. The server keeps it, but anyone could ask for it before
 * playing — there is no account to tell who actually lost. Revealing it waits for results stored on
 * the server.
 */
export function DailyFinished({ challenge, outcome, livesLeft }: Props) {
  const t = useTranslations()
  const won = outcome === 'won'

  return (
    <div className={`daily-finished daily-finished--${outcome}`}>
      <span className="daily-finished__icon" aria-hidden="true">
        {won ? '🏆' : '💔'}
      </span>
      <h1 className="daily-finished__title">{won ? t.daily.wonTitle : t.daily.lostTitle}</h1>
      <p className="daily-finished__subtitle">
        {t.daily.title} #{challenge.number} — {challenge.playerA.name} {t.daily.versus} {challenge.playerB.name}
      </p>
      <p className="daily-finished__text">
        {won ? t.daily.wonText(livesLeft) : t.daily.lostText(challenge.optimalLinks)}
      </p>
      <p className="daily-finished__tomorrow">{t.daily.comeBackTomorrow}</p>
      <div className="daily-finished__actions">
        <Link href={`/${challenge.sport}/free`} className="btn btn--primary">
          {t.daily.freePlay}
        </Link>
        <Link href="/" className="btn btn--ghost">
          {t.about.back}
        </Link>
      </div>
    </div>
  )
}
