'use client'

import { useReducer, useRef, useCallback } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { GameEngine, createEngine, InputResult, UserInput } from '../game/engine'
import { players, clubs, memberships } from '../mock/data'
import { HomeScreen } from './home/HomeScreen'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryScreen } from './victory/VictoryScreen'

type Phase = 'home' | 'setup' | 'playing' | 'victory'

type UIState = {
  phase: Phase
  difficulty: DifficultyLevel
  playerA: Player | null
  playerB: Player | null
  game: Game | null
  moveCount: number
  lastError: string | null
}

type Action =
  | { type: 'GO_TO_SETUP' }
  | { type: 'SET_PLAYER_A'; player: Player | null }
  | { type: 'SET_PLAYER_B'; player: Player | null }
  | { type: 'SET_DIFFICULTY'; difficulty: DifficultyLevel }
  | { type: 'START_GAME'; game: Game }
  | { type: 'SUBMIT_INPUT'; result: InputResult }
  | { type: 'DISMISS_ERROR' }
  | { type: 'PLAY_AGAIN' }

function initState(): UIState {
  return {
    phase: 'home',
    difficulty: 'easy',
    playerA: null,
    playerB: null,
    game: null,
    moveCount: 0,
    lastError: null,
  }
}

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case 'GO_TO_SETUP':
      return { ...state, phase: 'setup' }

    case 'SET_PLAYER_A':
      return { ...state, playerA: action.player }

    case 'SET_PLAYER_B':
      return { ...state, playerB: action.player }

    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.difficulty }

    case 'START_GAME':
      return { ...state, phase: 'playing', game: action.game, moveCount: 0, lastError: null }

    case 'SUBMIT_INPUT': {
      if (!action.result.ok) return { ...state, lastError: action.result.reason }
      const game = { ...action.result.game }
      const isVictory = game.path.length > 0
      return {
        ...state,
        game,
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

export function GamePage() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const engineRef = useRef<GameEngine | null>(null)

  const handleStart = useCallback(() => {
    if (!state.playerA || !state.playerB) return
    engineRef.current = createEngine(
      state.playerA,
      state.playerB,
      state.difficulty,
      memberships,
    )
    dispatch({ type: 'START_GAME', game: engineRef.current.game })
  }, [state.playerA, state.playerB, state.difficulty])

  const handleSubmit = useCallback((input: UserInput) => {
    if (!engineRef.current) return
    const result = engineRef.current.addInput(input)
    dispatch({ type: 'SUBMIT_INPUT', result })
  }, [])

  const handlePlayAgain = useCallback(() => {
    engineRef.current = null
    dispatch({ type: 'PLAY_AGAIN' })
  }, [])

  return (
    <div className="game-page">
      {state.phase === 'home' && (
        <HomeScreen onLaunch={() => dispatch({ type: 'GO_TO_SETUP' })} />
      )}

      {state.phase === 'setup' && (
        <SetupScreen
          playerA={state.playerA}
          playerB={state.playerB}
          difficulty={state.difficulty}
          onSetPlayerA={p => dispatch({ type: 'SET_PLAYER_A', player: p })}
          onSetPlayerB={p => dispatch({ type: 'SET_PLAYER_B', player: p })}
          onDifficultyChange={d => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
          onStart={handleStart}
        />
      )}

      {state.phase === 'playing' && state.game && (
        <GameScreen
          game={state.game}
          players={players}
          clubs={clubs}
          onSubmit={handleSubmit}
          lastError={state.lastError}
          onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
        />
      )}

      {state.phase === 'victory' && state.game && (
        <VictoryScreen
          game={state.game}
          players={players}
          moveCount={state.moveCount}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}
