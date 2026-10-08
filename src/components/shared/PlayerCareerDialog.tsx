'use client'

import { useEffect, useState } from 'react'
import { Player } from '../../domain/player'
import { CareerStint } from '../../domain/career'
import { formatSeasonSpan } from '../../domain/season'
import { getPlayerCareer } from '../../lib/gameApi'
import { useTranslations } from '../../i18n'
import { Modal } from '../shared/Modal'
import { ClubLogo } from './ClubLogo'

type Props = {
  /** The player whose career is shown; null when the dialog is closed. */
  player: Player | null
  onClose: () => void
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; stints: CareerStint[] }

const formatSpan = (stint: CareerStint) => formatSeasonSpan(stint.from, stint.to)

/**
 * A player's career, club by club, oldest first — so a user who has never heard of a player can
 * still see where he played: A and B on the daily's intro, and any player card on the board.
 * Loaded when opened, one small request per player.
 */
export function PlayerCareerDialog({ player, onClose }: Props) {
  const t = useTranslations()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const playerId = player?.id

  useEffect(() => {
    if (!playerId) return
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    getPlayerCareer(playerId, controller.signal)
      .then(({ stints }) => setLoad({ status: 'ready', stints }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      })
    return () => controller.abort()
  }, [playerId])

  return (
    <Modal open={player !== null} onClose={onClose} labelledBy="career-dialog-title" className="career-dialog">
      <h2 id="career-dialog-title" className="career-dialog__title">
        {player?.nationality && <span className={`fi fi-${player.nationality.toLowerCase()}`} aria-hidden="true" />}
        {player?.name}
      </h2>

      {load.status === 'loading' && <p className="career-dialog__status">{t.common.loading}</p>}
      {load.status === 'error' && <p className="career-dialog__status">{t.daily.careerError}</p>}
      {load.status === 'ready' && load.stints.length === 0 && (
        <p className="career-dialog__status">{t.daily.careerEmpty}</p>
      )}
      {load.status === 'ready' && load.stints.length > 0 && (
        <ol className="career-dialog__stints">
          {load.stints.map((stint) => (
            <li key={`${stint.club.id}-${stint.from}`} className="career-dialog__stint">
              <span className="career-dialog__years">{formatSpan(stint)}</span>
              <span className="career-dialog__club">
                <ClubLogo club={stint.club} />
                {stint.club.name}
              </span>
              {stint.games !== null && (
                <span className="career-dialog__games">
                  {stint.games} {t.daily.games}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="btn btn--ghost" onClick={onClose}>
        {t.daily.close}
      </button>
    </Modal>
  )
}
