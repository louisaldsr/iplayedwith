'use client'

import { useReducer, useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Game, DifficultyLevel } from '../game/game'
import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { SportId } from '../domain/sport'
import { DailyChallenge, DAILY_LIVES } from '../domain/dailyChallenge'
import { RemoteEngine, RemoteInputResult, createRemoteEngine } from '../game/remoteEngine'
import { UserInput } from '../game/userInput'
import { useTranslations } from '../i18n'
import { SetupScreen } from './setup/SetupScreen'
import { GameScreen } from './game/GameScreen'
import { VictoryScreen } from './victory/VictoryScreen'
import { DailyIntro } from './daily/DailyIntro'
import { DailyFinished } from './daily/DailyFinished'
import { DailyBoard, DailyOutcome, readDailyRecord, saveDailyRecord } from '../lib/dailyProgress'

/** `finished`: a daily already over — lost in this session, or won or lost earlier today. */
type Phase = 'setup' | 'playing' | 'victory' | 'finished'

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
  /** Daily only: lives left. Null in free play, which has none. */
  lives: number | null
  /** Bumped on every life lost — the key that replays the red flash. */
  lifeLostCount: number
  /** Bumped on every move the server refused — resets the input for the next guess. */
  rejectedCount: number
  /** How a finished daily ended. */
  outcome: DailyOutcome | null
}

type Action =
  | { type: 'SET_PLAYER_A'; player: Player | null }
  | { type: 'SET_PLAYER_B'; player: Player | null }
  | { type: 'SET_DIFFICULTY'; difficulty: DifficultyLevel }
  | { type: 'START_GAME'; game: Game; players: Player[] }
  | { type: 'SUBMIT_PENDING' }
  | { type: 'SUBMIT_INPUT'; result: RemoteInputResult; message: string }
  | { type: 'DISMISS_ERROR' }
  | { type: 'PLAY_AGAIN' }

/** Where a daily stands in this browser today, read once on mount. Null in free play. */
type DailyStart = {
  livesLeft: number
  outcome: DailyOutcome | null
  /** The engine rebuilt from the saved board, when the day was launched and is not over. */
  engine: RemoteEngine | null
  moveCount: number
}

function readDailyStart(mode: GameMode): DailyStart | null {
  if (mode.kind !== 'daily') return null
  const { sport, day, playerA, playerB } = mode.challenge
  const record = readDailyRecord(sport, day)
  const outcome = record.outcome ?? (record.livesLeft === 0 ? 'lost' : null)
  const board = outcome ? undefined : record.board
  const engine = board
    ? createRemoteEngine(sport, playerA, playerB, 'easy', { ...board, startedAt: new Date(board.startedAt) })
    : null
  return { livesLeft: record.livesLeft, outcome, engine, moveCount: board?.moveCount ?? 0 }
}

/**
 * Free play starts on its setup screen. A daily starts where this browser left it today: on the
 * board as it was, with the lives already lost, or straight on the finished screen if the day is
 * over — leaving and coming back must neither refill lives, replay a lost day, nor lose the board.
 */
function initState(start: DailyStart | null): UIState {
  const base = freshState()
  if (!start) return base

  const { livesLeft: lives, outcome, engine, moveCount } = start
  if (outcome) return { ...base, lives, outcome, phase: 'finished' }
  if (!engine) return { ...base, lives }
  return {
    ...base,
    lives,
    phase: 'playing',
    game: { ...engine.game },
    players: [...engine.players],
    clubs: [...engine.clubs],
    moveCount,
  }
}

/** What the daily keeps of a game in progress; the finished screens need none of it. */
type BoardState = Pick<UIState, 'phase' | 'game' | 'players' | 'clubs' | 'moveCount'>

function boardOf({ phase, game, players, clubs, moveCount }: BoardState): DailyBoard | undefined {
  if (phase !== 'playing' || !game) return undefined
  return {
    nodes: [...game.nodes.values()],
    edges: game.edges,
    players,
    clubs,
    moveCount,
    startedAt: game.startedAt.toISOString(),
  }
}

function freshState(): UIState {
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
    lives: null,
    lifeLostCount: 0,
    rejectedCount: 0,
    outcome: null,
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
        // A move the server judged clears the input for the next guess; after a transport error
        // it stays, so the same move can simply be retried.
        const rejectedCount = state.rejectedCount + (action.result.code ? 1 : 0)

        // Only a guess judged wrong costs a life — never an error, a duplicate or a game over.
        const costsLife = state.lives !== null && action.result.code === 'not-connected'
        if (!costsLife) return { ...state, submitting: false, lastError: action.message, rejectedCount }

        const lives = Math.max(0, state.lives! - 1)
        return {
          ...state,
          submitting: false,
          lastError: lives > 0 ? action.message : null,
          lives,
          lifeLostCount: state.lifeLostCount + 1,
          rejectedCount,
          ...(lives === 0 && { phase: 'finished' as const, outcome: 'lost' as const }),
        }
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
        outcome: isVictory && state.lives !== null ? 'won' : state.outcome,
      }
    }

    case 'DISMISS_ERROR':
      return { ...state, lastError: null }

    case 'PLAY_AGAIN':
      return freshState()

    default:
      return state
  }
}

/**
 * Free play: the user picks the pair and the difficulty.
 * Daily: the pair is the day's challenge, always in easy mode — one set of rules for everyone.
 */
export type GameMode = { kind: 'free' } | { kind: 'daily'; challenge: DailyChallenge }

const FREE_PLAY: GameMode = { kind: 'free' }

type Props = {
  sport: SportId
  mode?: GameMode
}

/**
 * The game shell.
 *
 * Nothing is fetched on mount: the setup screen paints immediately and every lookup
 * (player search, randomize, the direct-connection check, each move) is a bounded request
 * made on demand. The graph and its rules live on the server — see `remoteEngine`.
 */
export function GamePage({ sport, mode = FREE_PLAY }: Props) {
  const t = useTranslations()
  const [dailyStart] = useState(() => readDailyStart(mode))
  const [state, dispatch] = useReducer(reducer, dailyStart, initState)
  const engineRef = useRef<RemoteEngine | null>(dailyStart?.engine ?? null)

  const daily = mode.kind === 'daily' ? mode.challenge : null

  // The day's progress is saved on every change, so leaving and coming back resumes it: the board
  // from the first "Start", the lives left, and how it ended — which the menu also reads to colour
  // the sport.
  const { phase, game, players, clubs, moveCount } = state
  const board = useMemo(
    () => (daily ? boardOf({ phase, game, players, clubs, moveCount }) : undefined),
    [daily, phase, game, players, clubs, moveCount],
  )
  useEffect(() => {
    if (!daily || state.lives === null) return
    saveDailyRecord(daily.sport, daily.day, { livesLeft: state.lives, outcome: state.outcome ?? undefined, board })
  }, [daily, state.lives, state.outcome, board])

  const handleStart = useCallback(() => {
    const playerA = daily ? daily.playerA : state.playerA
    const playerB = daily ? daily.playerB : state.playerB
    const difficulty = daily ? 'easy' : state.difficulty
    if (!playerA || !playerB) return
    engineRef.current = createRemoteEngine(sport, playerA, playerB, difficulty)
    dispatch({
      type: 'START_GAME',
      game: engineRef.current.game,
      players: [playerA, playerB],
    })
  }, [sport, daily, state.playerA, state.playerB, state.difficulty])

  const handleSubmit = useCallback(
    async (input: UserInput) => {
      const engine = engineRef.current
      if (!engine) return
      dispatch({ type: 'SUBMIT_PENDING' })
      const result = await engine.addInput(input)
      // Shown in the player's language: the server's reason is French, its code is not.
      const message = result.ok ? '' : result.code ? t.game.rejections[result.code] : t.game.moveFailed
      dispatch({ type: 'SUBMIT_INPUT', result, message })
    },
    [t],
  )

  const handlePlayAgain = useCallback(() => {
    engineRef.current = null
    dispatch({ type: 'PLAY_AGAIN' })
  }, [])

  return (
    <div className="game-page">
      {state.phase === 'setup' && daily && <DailyIntro challenge={daily} onStart={handleStart} />}

      {state.phase === 'setup' && !daily && (
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
          lives={
            state.lives === null ? undefined : { left: state.lives, total: DAILY_LIVES, lostCount: state.lifeLostCount }
          }
          inputResetKey={state.rejectedCount}
        />
      )}

      {state.phase === 'finished' && daily && state.outcome && (
        <DailyFinished challenge={daily} outcome={state.outcome} livesLeft={state.lives ?? 0} />
      )}

      {/* Outside the game screen, so the flash of the last life still plays over the game-over one. */}
      {state.lifeLostCount > 0 && <div key={state.lifeLostCount} className="life-flash" aria-hidden="true" />}

      {state.phase === 'victory' && state.game && (
        <VictoryScreen
          game={state.game}
          players={state.players}
          moveCount={state.moveCount}
          optimalLinks={daily?.optimalLinks}
          lives={state.lives === null ? undefined : { left: state.lives, total: DAILY_LIVES }}
          onPlayAgain={daily ? undefined : handlePlayAgain}
          freePlayHref={daily ? `/${sport}/free` : undefined}
        />
      )}
    </div>
  )
}
