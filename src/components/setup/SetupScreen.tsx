'use client'

import { useEffect, useState } from 'react'
import { Player } from '../../domain/player'
import { SportId } from '../../domain/sport'
import { DifficultyLevel } from '../../game/game'
import { arePlayersConnected } from '../../lib/gameApi'
import { useTranslations } from '../../i18n'
import { PlayerPicker } from './PlayerPicker'
import { DifficultyPicker } from './DifficultyPicker'

type Props = {
  sport: SportId
  playerA: Player | null
  playerB: Player | null
  difficulty: DifficultyLevel
  onSetPlayerA: (p: Player | null) => void
  onSetPlayerB: (p: Player | null) => void
  onDifficultyChange: (d: DifficultyLevel) => void
  onStart: () => void
}

type ConnectionCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; directlyConnected: boolean }

export function SetupScreen({
  sport,
  playerA,
  playerB,
  difficulty,
  onSetPlayerA,
  onSetPlayerB,
  onDifficultyChange,
  onStart,
}: Props) {
  const t = useTranslations()
  const [check, setCheck] = useState<ConnectionCheck>({ status: 'idle' })

  // Easy mode auto-resolves the club/season between two players, so a pair who already
  // played together would be solved before it began. Only easy mode needs the guard.
  const playerAId = playerA?.id
  const playerBId = playerB?.id
  const needsCheck = difficulty === 'easy'

  useEffect(() => {
    if (!needsCheck || !playerAId || !playerBId) {
      setCheck({ status: 'idle' })
      return
    }

    let cancelled = false
    setCheck({ status: 'checking' })

    arePlayersConnected(playerAId, playerBId)
      .then(directlyConnected => {
        if (!cancelled) setCheck({ status: 'done', directlyConnected })
      })
      .catch(() => {
        // Treat an unreachable check as "not connected" rather than blocking the game; the
        // server revalidates every move regardless.
        if (!cancelled) setCheck({ status: 'done', directlyConnected: false })
      })

    return () => {
      cancelled = true
    }
  }, [needsCheck, playerAId, playerBId])

  const directlyConnected = check.status === 'done' && check.directlyConnected
  const canStart =
    playerA !== null && playerB !== null && check.status !== 'checking' && !directlyConnected

  return (
    <div className="setup-screen">
      <h2 className="setup-screen__title">{t.setup.title}</h2>

      <div className="setup-screen__players">
        <PlayerPicker
          role="A"
          sport={sport}
          selected={playerA}
          excludeId={playerB?.id}
          onSelect={onSetPlayerA}
        />
        <PlayerPicker
          role="B"
          sport={sport}
          selected={playerB}
          excludeId={playerA?.id}
          onSelect={onSetPlayerB}
        />
      </div>

      <DifficultyPicker value={difficulty} onChange={onDifficultyChange} />

      {directlyConnected && (
        <p className="setup-screen__warning">
          {t.setup.directlyConnectedWarning}
        </p>
      )}

      <button
        type="button"
        className="btn btn--primary btn--lg"
        disabled={!canStart}
        onClick={onStart}
      >
        {t.setup.launch}
      </button>
    </div>
  )
}
