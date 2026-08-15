'use client'

import { useEffect, useReducer, useRef, useCallback } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { Membership } from '../domain/membership'
import { SportId } from '../domain/sport'
import { GameEngine, createEngine, areDirectlyConnected, InputResult, UserInput } from '../game/engine'
import { useTranslations } from '../i18n'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryScreen } from './victory/VictoryScreen'

type Phase = 'setup' | 'playing' | 'victory'

type DataState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; players: Player[]; clubs: Club[]; memberships: Membership[] }

type UIState = {
  phase: Phase
  data: DataState
  difficulty: DifficultyLevel
  playerA: Player | null
  playerB: Player | null
  game: Game | null
  moveCount: number
  lastError: string | null
}

type Action =
  | { type: 'DATA_LOADING' }
  | { type: 'DATA_ERROR' }
  | { type: 'DATA_LOADED'; players: Player[]; clubs: Club[]; memberships: Membership[] }
  | { type: 'SET_PLAYER_A'; player: Player | null }
  | { type: 'SET_PLAYER_B'; player: Player | null }
  | { type: 'SET_DIFFICULTY'; difficulty: DifficultyLevel }
  | { type: 'START_GAME'; game: Game }
  | { type: 'SUBMIT_INPUT'; result: InputResult }
  | { type: 'DISMISS_ERROR' }
  | { type: 'PLAY_AGAIN' }

function initState(): UIState {
  return {
    phase: 'setup',
    data: { status: 'loading' },
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
    case 'DATA_LOADING':
      return { ...state, data: { status: 'loading' } }

    case 'DATA_ERROR':
      return { ...state, data: { status: 'error' } }

    case 'DATA_LOADED':
      return {
        ...state,
        data: { status: 'ready', players: action.players, clubs: action.clubs, memberships: action.memberships },
      }

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
      return { ...initState(), data: state.data }

    default:
      return state
  }
}

type Props = {
  sport: SportId
}

export function GamePage({ sport }: Props) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const engineRef = useRef<GameEngine | null>(null)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'DATA_LOADING' })

    async function load() {
      try {
        const [playersRes, clubsRes, membershipsRes] = await Promise.all([
          fetch(`/api/players?sport=${sport}`),
          fetch(`/api/clubs?sport=${sport}`),
          fetch(`/api/memberships?sport=${sport}`),
        ])
        if (!playersRes.ok || !clubsRes.ok || !membershipsRes.ok) throw new Error('Failed to load sport data')

        const [players, clubs, memberships] = await Promise.all([
          playersRes.json(),
          clubsRes.json(),
          membershipsRes.json(),
        ])
        if (cancelled) return
        dispatch({ type: 'DATA_LOADED', players, clubs, memberships })
      } catch {
        if (!cancelled) dispatch({ type: 'DATA_ERROR' })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [sport])

  const handleStart = useCallback(() => {
    if (state.data.status !== 'ready') return
    if (!state.playerA || !state.playerB) return
    if (state.difficulty === 'easy' && areDirectlyConnected(state.playerA, state.playerB, state.data.memberships)) return
    engineRef.current = createEngine(state.playerA, state.playerB, state.difficulty, state.data.memberships)
    dispatch({ type: 'START_GAME', game: engineRef.current.game })
  }, [state.data, state.playerA, state.playerB, state.difficulty])

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
      {state.data.status === 'loading' && (
        <p className="game-page__status">{t.common.loading}</p>
      )}

      {state.data.status === 'error' && (
        <p className="game-page__status game-page__status--error">{t.common.loadError}</p>
      )}

      {state.data.status === 'ready' && state.phase === 'setup' && (
        <SetupScreen
          players={state.data.players}
          memberships={state.data.memberships}
          playerA={state.playerA}
          playerB={state.playerB}
          difficulty={state.difficulty}
          onSetPlayerA={p => dispatch({ type: 'SET_PLAYER_A', player: p })}
          onSetPlayerB={p => dispatch({ type: 'SET_PLAYER_B', player: p })}
          onDifficultyChange={d => dispatch({ type: 'SET_DIFFICULTY', difficulty: d })}
          onStart={handleStart}
        />
      )}

      {state.data.status === 'ready' && state.phase === 'playing' && state.game && (
        <GameScreen
          game={state.game}
          players={state.data.players}
          clubs={state.data.clubs}
          memberships={state.data.memberships}
          onSubmit={handleSubmit}
          lastError={state.lastError}
          onDismissError={() => dispatch({ type: 'DISMISS_ERROR' })}
        />
      )}

      {state.data.status === 'ready' && state.phase === 'victory' && state.game && (
        <VictoryScreen
          game={state.game}
          players={state.data.players}
          moveCount={state.moveCount}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}
