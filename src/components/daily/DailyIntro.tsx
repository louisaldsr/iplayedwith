import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { Player } from '../../domain/player'
import { useTranslations } from '../../i18n'

type Props = {
  challenge: DailyChallenge
  onStart: () => void
}

/** "2026-09-25" → the reader's own long date. UTC on both sides, so the day never shifts. */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <div className="player-picker player-picker--selected">
      <div className="player-picker__selected">
        <img src="/dummy.svg" alt={player.name} className="player-picker__avatar" />
        <span className="player-picker__name">{player.name}</span>
      </div>
    </div>
  )
}

/** The daily's setup phase: nothing to choose, only the pair to discover before starting. */
export function DailyIntro({ challenge, onStart }: Props) {
  const t = useTranslations()

  return (
    <div className="setup-screen daily-intro">
      <div className="daily-intro__header">
        <h2 className="setup-screen__title">
          {t.daily.title} #{challenge.number}
        </h2>
        <p className="daily-intro__date">{formatDay(challenge.day)}</p>
      </div>

      <p className="setup-screen__empty">{t.daily.intro}</p>

      <div className="setup-screen__players daily-intro__players">
        <PlayerCard player={challenge.playerA} />
        <span className="daily-intro__versus">{t.daily.versus}</span>
        <PlayerCard player={challenge.playerB} />
      </div>

      <div className="victory-stat">
        <span className="stat-label">{t.daily.bestPossible}</span>
        <span className="stat-value">
          {challenge.optimalLinks} <span className="daily-intro__unit">{t.daily.links}</span>
        </span>
      </div>

      <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
        {t.daily.start}
      </button>

      <Link href={`/${challenge.sport}/free`} className="daily-intro__free-play">
        {t.daily.freePlayLink}
      </Link>
    </div>
  )
}
