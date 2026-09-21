'use client'

import { useReducer, useRef, useCallback } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { SportId } from '../domain/sport'
import { RemoteEngine, RemoteInputResult, createRemoteEngine } from '../game/remoteEngine'
import { UserInput } from '../game/userInput'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryScreen } from './victory/VictoryScreen'

type Phase = 'setup' | 'playing' | 'victory'

type UIState = {
  phase: Phase
  difficulty: DifficultyLevel
  playerA: Player | null
  playerB: Player | null
  game: Game | null
  /** The players and clubs currently on the board — grown one move at a time by the server. */
  players: Player[]
  clubs: Club[]
  submitting: boolean
  moveCount: number
  lastError: string | null
}

type Action =
  | { type: 'SET_PLAYER_A'; player: Player | null }
  | { type: 'SET_PLAYER_B'; player: Player | null }
  | { type: 'SET_DIFFICULTY'; difficulty: DifficultyLevel }
  | { type: 'START_GAME'; game: Game; players: Player[] }
  | { type: 'SUBMIT_PENDING' }
  | { type: 'SUBMIT_INPUT'; result: RemoteInputResult }
  | { type: 'DISMISS_ERROR' }
  | { type: 'PLAY_AGAIN' }

function initState(): UIState {
  return {
    phase: 'setup',
    difficulty: 'easy',
    playerA: null,
    playerB: null,
    game: null,
    players: [],
    clubs: [],
    submitting: false,
    moveCount: 0,
    lastError: null,
  }
}

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case 'SET_PLAYER_A':
      return { ...state, playerA: action.player }

    case 'SET_PLAYER_B':
      return { ...state, playerB: action.player }

    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty }

    case 'START_GAME':
      return {
        ...state,
        phase: 'playing',
        game: action.game,
        players: action.players,
        clubs: [],
        moveCount: 0,
        lastError: null,
      }

    case 'SUBMIT_PENDING':
      return { ...state, submitting: true }

    case 'SUBMIT_INPUT': {
      if (!action.result.ok) {
        return { ...state, submitting: false, lastError: action.result.reason }
      }
      const game = { ...action.result.game }
      const isVictory = game.path.length > 0
      return {
        ...state,
        game,
        players: action.result.players,
        clubs: action.result.clubs,
        submitting: false,
        moveCount: state.moveCount + 1,
        lastError: null,
        phase: isVictory ? 'victory' : 'playing',
      }
    }

    case 'DISMISS_ERROR':
      return { ...state, lastError: null }

    case 'PLAY_AGAIN':
      return initState()

    default:
      return state
  }
}

type Props = {
  sport: SportId
}

/**
 * The game shell.
 *
 * Nothing is fetched on mount: the setup screen paints immediately and every lookup
 * (player search, randomize, the direct-connection check, each move) is a bounded request
 * made on demand. The graph and its rules live on the server — see `remoteEngine`.
 */
export function GamePage({ sport }: Props) {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const engineRef = useRef<RemoteEngine | null>(null)

  const handleStart = useCallback(() => {
    if (!state.playerA || !state.playerB) return
    engineRef.current = createRemoteEngine(sport, state.playerA, state.playerB, state.difficulty)
    dispatch({
      type: 'START_GAME',
      game: engineRef.current.game,
      players: [state.playerA, state.playerB],
    })
  }, [sport, state.playerA, state.playerB, state.difficulty])

  const handleSubmit = useCallback(async (input: UserInput) => {
    const engine = engineRef.current
    if (!engine) return
    dispatch({ type: 'SUBMIT_PENDING' })
    const result = await engine.addInput(input)
    dispatch({ type: 'SUBMIT_INPUT', result })
  }, [])

  const handlePlayAgain = useCallback(() => {
    engineRef.current = null
    dispatch({ type: 'PLAY_AGAIN' })
  }, [])

  return (
    <div className="game-page">
      {state.phase === 'setup' && (
        <SetupScreen
          sport={sport}
          playerA={state.playerA}
          playerB={state.playerB}
          difficulty={state.difficulty}
          onSetPlayerA={(p) => dispatch({ type: 'SET_PLAYER_A', player: p })}
          onSetPlayerB={(p) => dispatch({ type: 'SET_PLAYER_B', player: p })}
          onDifficultyChange={(d) => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
          onStart={handleStart}
        />
      )}

      {state.phase === 'playing' && state.game && (
        <GameScreen
          game={state.game}
          sport={sport}
          players={state.players}
          clubs={state.clubs}
          submitting={state.submitting}
          onSubmit={handleSubmit}
          lastError={state.lastError}
          onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
        />
      )}

      {state.phase === 'victory' && state.game && (
        <VictoryScreen
          game={state.game}
          players={state.players}
          moveCount={state.moveCount}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}
