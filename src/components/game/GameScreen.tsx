'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Game } from '../../game/game'
import { Player } from '../../domain/player'
import { Club } from '../../domain/club'
import { Membership } from '../../domain/membership'
import { PlayerId } from '../../domain/ids'
import { UserInput } from '../../game/engine'
import { useTranslations } from '../../i18n'
import { GameBoard } from './GameBoard'
import { MoveInput } from './MoveInput'
import { ErrorBanner } from './ErrorBanner'

type Props = {
  game: Game
  players: Player[]
  clubs: Club[]
  memberships: Membership[]
  onSubmit: (input: UserInput) => void
  lastError: string | null
  onDismissError: () => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function GameScreen({ game, players, clubs, memberships, onSubmit, lastError, onDismissError }: Props) {
  const t = useTranslations()
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - game.startedAt.getTime())
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [game.startedAt])

  const alreadyInGraph = useMemo(() => {
    const ids = new Set<PlayerId>()
    for (const node of game.nodes.values()) {
      if (node.kind === 'player') ids.add(node.id)
    }
    return ids
  }, [game])

  const difficultyLabel = game.difficulty === 'easy' ? t.setup.easy : t.setup.hard

  return (
    <div className="game-screen">
      <div className="game-topbar">
        <div className="game-topbar__players">
          <span className="game-topbar__player">{game.playerA.name}</span>
          <span className="game-topbar__arrow"></span>
          <span className="game-topbar__player">{game.playerB.name}</span>
        </div>
        <span className="game-topbar__chrono">{formatTime(elapsed)}</span>
        <span className="game-topbar__badge">{difficultyLabel}</span>
      </div>

      <div className="game-screen-board">
        <GameBoard game={game} players={players} clubs={clubs} />
      </div>

      <div className="game-screen-controls">
        {lastError && (
          <ErrorBanner message={lastError} onDismiss={onDismissError} />
        )}
        <MoveInput
          key={game.edges.length}
          difficulty={game.difficulty}
          players={players}
          clubs={clubs}
          memberships={memberships}
          alreadyInGraph={alreadyInGraph}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
