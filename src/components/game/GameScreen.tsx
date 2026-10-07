'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Game } from '../../game/game'
import { Player } from '../../domain/player'
import { Club } from '../../domain/club'
import { PlayerId } from '../../domain/ids'
import { SportId } from '../../domain/sport'
import { UserInput } from '../../game/userInput'
import { useTranslations } from '../../i18n'
import { GameBoard } from './GameBoard'
import { MoveInput } from './MoveInput'
import { ErrorBanner } from './ErrorBanner'
import { LivesBar } from './LivesBar'
import { PlayerCareerDialog } from '../shared/PlayerCareerDialog'
import { useUsername } from '../shared/useUsername'
import { formatUsername } from '../../domain/visitorName'
import { DailySolution } from '../../domain/dailySolution'
import { formatTime } from '../../lib/formatTime'

type Props = {
  game: Game
  sport: SportId
  /** Only the players and clubs on the board — each one arrives with the move that added it. */
  players: Player[]
  clubs: Club[]
  submitting: boolean
  onSubmit: (input: UserInput) => void
  lastError: string | null
  onDismissError: () => void
  /** Daily only: the lives, shown at the bottom of the board. */
  lives?: { left: number; total: number; lostCount: number }
  /** Changes when the input should start empty again — after a refused move. */
  inputResetKey?: number
  /**
   * Set once the game is over — won, or a daily lost: the board stays (a won one with its chain
   * lit), the clock stops at the final move and `bar` takes the place of the move input.
   */
  over?: { elapsedMs: number; bar: ReactNode }
  /** Daily, once over and asked for: the proposed solution, laid over the board. */
  solution?: DailySolution
  /** Floats at the top of the board, centred — the daily's "Proposed Solution" checkbox. */
  boardOverlay?: ReactNode
  /** Every career opened from the board — the daily records the ones that are hints. */
  onCareerOpened?: (player: Player) => void
}

export function GameScreen({
  game,
  sport,
  players,
  clubs,
  submitting,
  onSubmit,
  lastError,
  onDismissError,
  lives,
  inputResetKey = 0,
  over,
  solution,
  boardOverlay,
  onCareerOpened,
}: Props) {
  const t = useTranslations()
  const [careerOf, setCareerOf] = useState<Player | null>(null)
  const { username } = useUsername()
  const openCareer = (player: Player) => {
    setCareerOf(player)
    onCareerOpened?.(player)
  }
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const ended = over !== undefined
  useEffect(() => {
    if (ended) return
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - game.startedAt.getTime())
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [game.startedAt, ended])

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
        <span className="game-topbar__chrono">{formatTime(over?.elapsedMs ?? elapsed)}</span>
        {/* One group on wide screens; on phones the name drops to a row of its own (see CSS). */}
        <div className="game-topbar__end">
          {username && (
            <span className="game-topbar__visitor" title={t.menu.yourName}>
              <span aria-hidden="true">👤 </span>
              <span className="visually-hidden">{t.menu.yourName}: </span>
              {formatUsername(username, t.visitorNames)}
            </span>
          )}
          <span className="game-topbar__badge">{difficultyLabel}</span>
        </div>
      </div>

      <div className="game-screen-board">
        <GameBoard game={game} players={players} clubs={clubs} onOpenPlayer={openCareer} solution={solution} />
        {boardOverlay}
        {/* A refused guess floats at the top of the board — the bar below keeps its size, the hearts
            at the bottom stay clear (the solution switch, up there too, only comes once the game is
            over). It goes after a few seconds, or as soon as the next guess is typed. */}
        {lastError && !over && <ErrorBanner key={inputResetKey} message={lastError} onDismiss={onDismissError} />}
        {lives && <LivesBar left={lives.left} total={lives.total} lostCount={lives.lostCount} />}
      </div>

      <PlayerCareerDialog player={careerOf} onClose={() => setCareerOf(null)} />

      {/* Red-rimmed while a refused guess is shown above: the message and the field go together. */}
      <div className={`game-screen-controls${lastError && !over ? ' game-screen-controls--refused' : ''}`}>
        {over ? (
          over.bar
        ) : (
          <>
            <MoveInput
              key={`${game.edges.length}-${inputResetKey}`}
              sport={sport}
              difficulty={game.difficulty}
              alreadyInGraph={alreadyInGraph}
              submitting={submitting}
              onSubmit={onSubmit}
              onEdit={lastError ? onDismissError : undefined}
            />
          </>
        )}
      </div>
    </div>
  )
}
