'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DailyChallenge } from '../../domain/dailyChallenge'
import { Player } from '../../domain/player'
import { useTranslations } from '../../i18n'
import { PlayerCareerDialog } from '../shared/PlayerCareerDialog'
import { formatDay } from '../../lib/formatDay'

type Props = {
  challenge: DailyChallenge
  /** A past day, from the archive: it counts late — in the stats and the day's ranking, not the streak. */
  archived?: boolean
  onStart: () => void
}

/** A player of the pair: opens their career, for anyone who does not know them. */
function PlayerButton({ player, onOpen }: { player: Player; onOpen: (p: Player) => void }) {
  const t = useTranslations()
  return (
    <button type="button" className="daily-player" onClick={() => onOpen(player)}>
      {player.nationality && (
        <span className={`fi fi-${player.nationality.toLowerCase()} daily-player__flag`} aria-hidden="true" />
      )}
      <span className="daily-player__name">{player.name}</span>
      <span className="daily-player__hint">{t.daily.viewCareer}</span>
    </button>
  )
}

/** The daily's setup phase: nothing to choose, only the pair to discover before starting. */
export function DailyIntro({ challenge, archived = false, onStart }: Props) {
  const t = useTranslations()
  const [careerOf, setCareerOf] = useState<Player | null>(null)

  return (
    <div className="daily-intro">
      <header className="daily-intro__header">
        <h1 className="daily-intro__title">
          {archived ? t.archive.title : t.daily.title} <span className="daily-intro__number">#{challenge.number}</span>
        </h1>
        <p className="daily-intro__date">{formatDay(challenge.day, archived)}</p>
        {archived && <p className="daily-intro__late">{t.archive.lateNote}</p>}
      </header>

      <div className="daily-intro__players">
        <PlayerButton player={challenge.playerA} onOpen={setCareerOf} />
        <span className="daily-intro__versus">{t.daily.versus}</span>
        <PlayerButton player={challenge.playerB} onOpen={setCareerOf} />
      </div>

      <p className="daily-intro__best">
        {t.daily.bestPossible} <strong>{challenge.optimalLinks}</strong> {t.daily.links}
      </p>

      <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
        {t.daily.start}
      </button>

      {archived ? (
        <Link href={`/${challenge.sport}/archive`} className="daily-intro__free-play">
          {t.archive.back}
        </Link>
      ) : (
        <Link href={`/${challenge.sport}/free`} className="daily-intro__free-play">
          {t.daily.freePlayLink}
        </Link>
      )}

      <PlayerCareerDialog player={careerOf} onClose={() => setCareerOf(null)} />
    </div>
  )
}
